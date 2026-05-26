<!-- toc -->

# Spark에서 AVG를 처리하는 방법

AVG 자체는 monoid가 아니기 때문에 분산 처리가 불가하다. 따라서 Spark에서는 AVG를 monoid인 형태로 변환해 처리한다.

(합계, 개수) 쌍은 monoid 이기 때문에 Spark에서도 이 형태로 바꾸어 분산처리 한다.

<!-- empty-paragraph -->

## (합계, 개수) 쌍이 monoid인 이유

(합계, 개수) 쌍 = (Int, Int) 튜플로 본다.

<!-- empty-paragraph -->

**1\. 닫힘 (연산 결과가 같은 집합)**

```
(3, 2) ⊕ (7, 2) = (10, 4) → 결과도 (Int, Int) 쌍
```

<!-- empty-paragraph -->

**2\. 결합법칙**

```
((3,2) ⊕ (7,2)) ⊕ (5,1) = (10,4) ⊕ (5,1) = (15,5)
(3,2) ⊕ ((7,2) ⊕ (5,1)) = (3,2) ⊕ (12,3) = (15,5)
```

<!-- empty-paragraph -->

**3\. 항등원**

```
(0, 0) ⊕ (3, 2) = (3, 2)
```

<!-- empty-paragraph -->

## Spark에서 monoid로 처리하는 방법

```
# [원본 데이터: 1, 2, 3, 4]에서 각 원소를 (값, 1)로 변환
(1,1)  (2,1)  (3,1)  (4,1)

# 서버별로 나눠서 merge
서버1: (1,1) ⊕ (2,1) = (3, 2)
서버2: (3,1) ⊕ (4,1) = (7, 2)

# 최종 merge
(3+7, 2+2) = (10, 4)

# 마지막에 나누기
10/4 = 2.5
```

<!-- empty-paragraph -->

## 실제 Spark 코드에서 보면

```scala
package study.spark

object Test extends SparkTestBase {
  def main(args: Array[String]): Unit = {
    import spark.implicits._

    Seq(
      ("U001", "A001", 4.0),
      ("U001", "A002", 5.0),
      ("U001", "A003", 5.0),
      ("U002", "A001", 3.0),
      ("U002", "A002", 3.0),
      ("U002", "A003", 4.0),
      ("U003", "A001", 5.0),
      ("U003", "A002", 4.0),
      ("U003", "A003", 4.0),
    ).toDF("user_id", "product_id", "score")
      .createOrReplaceTempView("review")

    spark.sql(
      """SELECT  AVG(score) AS sum
         FROM  review"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Project ['AVG('score) AS sum#16]
+- 'UnresolvedRelation [review], [], false

== Analyzed Logical Plan ==
sum: double
Aggregate [avg(score#15) AS sum#16]
+- SubqueryAlias review
   +- View (`review`, [user_id#13, product_id#14, score#15])
      +- Project [_1#3 AS user_id#13, _2#4 AS product_id#14, _3#5 AS score#15]
         +- LocalRelation [_1#3, _2#4, _3#5]

== Optimized Logical Plan ==
Aggregate [avg(score#15) AS sum#16]
+- LocalRelation [score#15]

== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- HashAggregate(keys=[], functions=[avg(score#15)], output=[sum#16])
   +- Exchange SinglePartition, ENSURE_REQUIREMENTS, [plan_id=14]
      +- HashAggregate(keys=[], functions=[partial_avg(score#15)], output=[sum#20, count#21L])
         +- LocalTableScan [score#15]
```

<!-- empty-paragraph -->

`HashAggregate (partial_avg) → output=[sum#20, count#21L]` 이 monoid 형태로 변환하는 부분이다.

<!-- empty-paragraph -->

# DISTINCT를 monoid 관점에서 분석하기

## 왜 COUNT(DISTINCT)는 기본적으로 Monoid가 아닌가?

일반 집계함수들은 Monoid 준동형(Homomorphism) 이 성립한다.

<!-- empty-paragraph -->

> **Monoid 준동형(Homomorphism)**
> 
> <!-- empty-paragraph -->
> 
> 두 Monoid 사이에 구조를 보존하는 변환이다.
> 
> ```
> f(a ⊕ b) = f(a) ⊕ f(b)
> ```
> 
> "합친 다음 변환" = "각각 변환한 다음 합치기"가 같으면 준동형이다.
> 
> <!-- empty-paragraph -->
> 
> AVG를 예시로 들자면,
> 
> ```
> f = "리스트를 (합계, 개수)로 변환"
> 
> f([1,2,3,4])        = (10, 4)
> f([1,2]) ⊕ f([3,4]) = (3,2) ⊕ (7,2) = (10, 4)
> ```

<!-- empty-paragraph -->

일반 집계함수들은 Monoid 준동형(Homomorphism)이 성립한다.

```
SUM:   f(A ∪ B) = f(A) + f(B)       ✓ 분산 가능
COUNT: f(A ∪ B) = f(A) + f(B)       ✓ 분산 가능
MAX:   f(A ∪ B) = max(f(A), f(B))   ✓ 분산 가능
```

<!-- empty-paragraph -->

하지만 COUNT(DISTINCT)는 부분 결과를 합칠 수가 없기 때문에 Monoid 준동형이 성립하지 않는다.

```
파티션1: {A, A, B}  → distinct count = 2
파티션2: {A, C}     → distinct count = 2

단순 합산: 2 + 2 = 4  ❌ (실제 정답은 3: A, B, C)
```

<!-- empty-paragraph -->

## Spark가 COUNT(DISTINCT)를 해결한 방법

(user\_id, product\_id)로 재파티셔닝하여 같은 product\_id는 반드시 같은 노드로 보낸다.

<!-- empty-paragraph -->

(user\_id, product\_id)로 Shuffle 한다.

```
노드1: {(u1, A), (u1, A), (u1, A)}  → product_id A의 모든 레코드
노드2: {(u1, B), (u1, B)}           → product_id B의 모든 레코드
노드3: {(u1, C)}                    → product_id C의 모든 레코드
```

<!-- empty-paragraph -->

이제 각 노드에서 (user\_id, product\_id) 조합은 전 세계에서 하나의 노드에만 존재한다.

```
f(파티션1) + f(파티션2) + f(파티션3) = 1 + 1 + 1 = 3  ✓ 
→ COUNT가 다시 Monoid가 된다.
```

<!-- empty-paragraph -->

수학적으로 표현하면 다음과 같다.

| ​ | COUNT(DISTINCT) 직접 | Spark의 방식 |
| --- | --- | --- |
| 중간 표현 | distinct 개수 (스칼라) | (user_id, product_id) 그룹 (집합) |
| 결합 연산 | + (불가) | 집합 Union → COUNT (가능) |
| Monoid | X | O |

# Adaptive Query Execution(AQE)

쿼리 실행 중 수집된 런타임 통계를 기반으로 쿼리 실행 계획을 동적으로 최적화하는 메커니즘이다. Spark의 옵티마이저 중 런타임 동적 옵티마이저이다.

<!-- empty-paragraph -->

## AQE의 핵심 최적화 3가지

#### 1\. 셔플 파티션 수 동적 조정 (Dynamically Coalescing Shuffle Partitions)

-   실행 전에 `spark.sql.shuffle.partitions`를 고정하는 대신, 셔플 후 실제 데이터 크기를 보고 파티션 수를 자동으로 줄여준다.
    
-   작은 파티션들을 합쳐서 over-partitioning 방지한다.
    

<!-- empty-paragraph -->

#### 2\. 조인 전략 동적 변경 (Dynamically Switching Join Strategies)

-   실행 계획 수립 시 Sort Merge Join으로 계획됐더라도, 런타임에 한쪽 테이블이 작다고 판단되면 Broadcast Hash Join으로 자동 전환한다.
    
-   네트워크 셔플 비용을 크게 절감시킨다.
    

<!-- empty-paragraph -->

#### 3\. 스큐 조인 최적화 (Dynamically Optimizing Skew Joins)

-   특정 파티션에 데이터가 쏠리는 데이터 skew 문제를 런타임에 감지한다.
    
-   skewed 파티션을 여러 개의 작은 파티션으로 분할하여 병렬 처리한다.