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

    val x = Seq(
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

    x.createOrReplaceTempView("review")

    x.distinct()

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

`HashAggregate (partial_avg) → output=[sum#20, count#21L]` monoid 형태로 변환하는 부분