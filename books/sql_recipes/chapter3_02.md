<!-- toc -->

## 7강 하나의 테이블에 대한 조작

### 1\. 그룹의 특징 잡기

#### 테이블 전체의 특징량 계산하기

```sql
SELECT COUNT(*) AS total_count
     , COUNT(DISTINCT user_id) AS user_count
     , COUNT(DISTINCT product_id) AS product_count
     , SUM(score) AS sum
     , AVG(score) AS avg
     , MAX(score) AS max
     , MIN(score) AS min
FROM  review
;
```

<!-- empty-paragraph -->

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
      """SELECT COUNT(*) AS total_count
              , COUNT(DISTINCT user_id) AS user_count
              , COUNT(DISTINCT product_id) AS product_count
              , SUM(score) AS sum
              , AVG(score) AS avg
              , MAX(score) AS max
              , MIN(score) AS min
         FROM  review"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Project ['COUNT(1) AS total_count#16, 'COUNT(distinct 'user_id) AS user_count#17, 'COUNT(distinct 'product_id) AS product_count#18, 'SUM('score) AS sum#19, 'AVG('score) AS avg#20, 'MAX('score) AS max#21, 'MIN('score) AS min#22]
+- 'UnresolvedRelation [review], [], false

== Analyzed Logical Plan ==
total_count: bigint, user_count: bigint, product_count: bigint, sum: double, avg: double, max: double, min: double
Aggregate [count(1) AS total_count#16L, count(distinct user_id#13) AS user_count#17L, count(distinct product_id#14) AS product_count#18L, sum(score#15) AS sum#19, avg(score#15) AS avg#20, max(score#15) AS max#21, min(score#15) AS min#22]
+- SubqueryAlias review
   +- View (`review`, [user_id#13, product_id#14, score#15])
      +- Project [_1#3 AS user_id#13, _2#4 AS product_id#14, _3#5 AS score#15]
         +- LocalRelation [_1#3, _2#4, _3#5]

== Optimized Logical Plan ==
Aggregate [coalesce(first(count(1)#34L, true) FILTER (WHERE (gid#30 = 0)), 0) AS total_count#16L, count(review.user_id#31) FILTER (WHERE (gid#30 = 1)) AS user_count#17L, count(review.product_id#32) FILTER (WHERE (gid#30 = 2)) AS product_count#18L, first(sum(review.score)#36, true) FILTER (WHERE (gid#30 = 0)) AS sum#19, first(avg(review.score)#38, true) FILTER (WHERE (gid#30 = 0)) AS avg#20, first(max(review.score)#40, true) FILTER (WHERE (gid#30 = 0)) AS max#21, first(min(review.score)#42, true) FILTER (WHERE (gid#30 = 0)) AS min#22]
+- Aggregate [review.user_id#31, review.product_id#32, gid#30], [review.user_id#31, review.product_id#32, gid#30, count(1) AS count(1)#34L, sum(review.score#33) AS sum(review.score)#36, avg(review.score#33) AS avg(review.score)#38, max(review.score#33) AS max(review.score)#40, min(review.score#33) AS min(review.score)#42]
   +- Expand [[null, null, 0, score#15], [user_id#13, null, 1, null], [null, product_id#14, 2, null]], [review.user_id#31, review.product_id#32, gid#30, review.score#33]
      +- LocalRelation [user_id#13, product_id#14, score#15]

== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- HashAggregate(keys=[], functions=[first(count(1)#34L, true), count(review.user_id#31), count(review.product_id#32), first(sum(review.score)#36, true), first(avg(review.score)#38, true), first(max(review.score)#40, true), first(min(review.score)#42, true)], output=[total_count#16L, user_count#17L, product_count#18L, sum#19, avg#20, max#21, min#22])
   +- HashAggregate(keys=[], functions=[partial_first(count(1)#34L, true) FILTER (WHERE (gid#30 = 0)), partial_count(review.user_id#31) FILTER (WHERE (gid#30 = 1)), partial_count(review.product_id#32) FILTER (WHERE (gid#30 = 2)), partial_first(sum(review.score)#36, true) FILTER (WHERE (gid#30 = 0)), partial_first(avg(review.score)#38, true) FILTER (WHERE (gid#30 = 0)), partial_first(max(review.score)#40, true) FILTER (WHERE (gid#30 = 0)), partial_first(min(review.score)#42, true) FILTER (WHERE (gid#30 = 0))], output=[first#56L, valueSet#57, count#58L, count#59L, first#60, valueSet#61, first#62, valueSet#63, first#64, valueSet#65, first#66, valueSet#67])
      +- HashAggregate(keys=[review.user_id#31, review.product_id#32, gid#30], functions=[count(1), sum(review.score#33), avg(review.score#33), max(review.score#33), min(review.score#33)], output=[review.user_id#31, review.product_id#32, gid#30, count(1)#34L, sum(review.score)#36, avg(review.score)#38, max(review.score)#40, min(review.score)#42])
         +- Exchange hashpartitioning(review.user_id#31, review.product_id#32, gid#30, 1), ENSURE_REQUIREMENTS, [plan_id=25]
            +- HashAggregate(keys=[review.user_id#31, review.product_id#32, gid#30], functions=[partial_count(1), partial_sum(review.score#33), partial_avg(review.score#33), partial_max(review.score#33), partial_min(review.score#33)], output=[review.user_id#31, review.product_id#32, gid#30, count#74L, sum#75, sum#76, count#77L, max#78, min#79])
               +- Expand [[null, null, 0, score#15], [user_id#13, null, 1, null], [null, product_id#14, 2, null]], [review.user_id#31, review.product_id#32, gid#30, review.score#33]
                  +- LocalTableScan [user_id#13, product_id#14, score#15]
```

<!-- empty-paragraph -->

1.  Expand: 각 행을 3개로 복제 (Optimized Plan에서 확인)
    
    -   gid=0: user\_id, product\_id를 null로 → COUNT(1), SUM, AVG, MAX, MIN용
        
    -   gid=1: user\_id 유지, product\_id=null → COUNT(DISTINCT user\_id)용
        
    -   gid=2: product\_id 유지, user\_id=null → COUNT(DISTINCT product\_id)용
        
2.  Partial HashAggregate: 각 파티션에서 (user\_id, product\_id, gid) 키로 로컬 집계
    
3.  Exchange (셔플): 동일한 (user\_id, product\_id, gid) 조합이 같은 파티션에 모이도록 재분배
    
4.  Final HashAggregate: 최상위 HashAggregate: gid별 결과를 합쳐 최종값 계산
    

<!-- empty-paragraph -->

→ 핵심: COUNT(DISTINCT col)이 하나라면 Spark가 더 단순한 방식으로 처리할 수 있지만, 서로 다른 컬럼에 대한 DISTINCT가 2개 이상 있으면 Expand 전략이 강제되고 셔플이 필수가 된다. 각 DISTINCT 값이 동일한 리듀서에 모여야 정확한 카운트가 보장되기 때문이다.

<!-- empty-paragraph -->

#### 그루핑한 데이터의 특징량 계산하기

```sql
SELECT 1=1
     , user_id
     , COUNT(*) AS total_count
     , COUNT(DISTINCT product_id) AS product_count
     , SUM(score) AS sum
     , AVG(score) AS avg
     , MAX(score) AS max
     , MIN(score) AS min
FROM   review
GROUP BY user_id
```

<!-- empty-paragraph -->

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
      """SELECT 1=1
              , user_id
              , COUNT(*) AS total_count
              , COUNT(DISTINCT product_id) AS product_count
              , SUM(score) AS sum
              , AVG(score) AS avg
              , MAX(score) AS max
              , MIN(score) AS min
         FROM   review
         GROUP BY user_id"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Aggregate ['user_id], [unresolvedalias((1 = 1)), 'user_id, 'COUNT(1) AS total_count#16, 'COUNT(distinct 'product_id) AS product_count#17, 'SUM('score) AS sum#18, 'AVG('score) AS avg#19, 'MAX('score) AS max#20, 'MIN('score) AS min#21]
+- 'UnresolvedRelation [review], [], false

== Analyzed Logical Plan ==
(1 = 1): boolean, user_id: string, total_count: bigint, product_count: bigint, sum: double, avg: double, max: double, min: double
Aggregate [user_id#13], [(1 = 1) AS (1 = 1)#28, user_id#13, count(1) AS total_count#16L, count(distinct product_id#14) AS product_count#17L, sum(score#15) AS sum#18, avg(score#15) AS avg#19, max(score#15) AS max#20, min(score#15) AS min#21]
+- SubqueryAlias review
   +- View (`review`, [user_id#13, product_id#14, score#15])
      +- Project [_1#3 AS user_id#13, _2#4 AS product_id#14, _3#5 AS score#15]
         +- LocalRelation [_1#3, _2#4, _3#5]

== Optimized Logical Plan ==
Aggregate [user_id#13], [true AS (1 = 1)#28, user_id#13, count(1) AS total_count#16L, count(distinct product_id#14) AS product_count#17L, sum(score#15) AS sum#18, avg(score#15) AS avg#19, max(score#15) AS max#20, min(score#15) AS min#21]
+- LocalRelation [user_id#13, product_id#14, score#15]

== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- HashAggregate(keys=[user_id#13], functions=[count(1), sum(score#15), avg(score#15), max(score#15), min(score#15), count(distinct product_id#14)], output=[(1 = 1)#28, user_id#13, total_count#16L, product_count#17L, sum#18, avg#19, max#20, min#21])
   +- Exchange hashpartitioning(user_id#13, 1), ENSURE_REQUIREMENTS, [plan_id=24]
      +- HashAggregate(keys=[user_id#13], functions=[merge_count(1), merge_sum(score#15), merge_avg(score#15), merge_max(score#15), merge_min(score#15), partial_count(distinct product_id#14)], output=[user_id#13, count#30L, sum#32, sum#35, count#36L, max#38, min#40, count#43L])
         +- HashAggregate(keys=[user_id#13, product_id#14], functions=[merge_count(1), merge_sum(score#15), merge_avg(score#15), merge_max(score#15), merge_min(score#15)], output=[user_id#13, product_id#14, count#30L, sum#32, sum#35, count#36L, max#38, min#40])
            +- Exchange hashpartitioning(user_id#13, product_id#14, 1), ENSURE_REQUIREMENTS, [plan_id=20]
               +- HashAggregate(keys=[user_id#13, product_id#14], functions=[partial_count(1), partial_sum(score#15), partial_avg(score#15), partial_max(score#15), partial_min(score#15)], output=[user_id#13, product_id#14, count#30L, sum#32, sum#35, count#36L, max#38, min#40])
                  +- LocalTableScan [user_id#13, product_id#14, score#15]
```

<!-- empty-paragraph -->

```
== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- HashAggregate(keys=[user_id#13], functions=[count(1), sum(score#15), avg(score#15), max(score#15), min(score#15), count(distinct product_id#14)], output=[(1 = 1)#28, user_id#13, total_count#16L, product_count#17L, sum#18, avg#19, max#20, min#21])
   +- Exchange hashpartitioning(user_id#13, 1), ENSURE_REQUIREMENTS, [plan_id=24]
      +- HashAggregate(keys=[user_id#13], functions=[merge_count(1), merge_sum(score#15), merge_avg(score#15), merge_max(score#15), merge_min(score#15), partial_count(distinct product_id#14)], output=[user_id#13, count#30L, sum#32, sum#35, count#36L, max#38, min#40, count#43L])
         +- HashAggregate(keys=[user_id#13, product_id#14], functions=[merge_count(1), merge_sum(score#15), merge_avg(score#15), merge_max(score#15), merge_min(score#15)], output=[user_id#13, product_id#14, count#30L, sum#32, sum#35, count#36L, max#38, min#40])
            +- Exchange hashpartitioning(user_id#13, product_id#14, 1), ENSURE_REQUIREMENTS, [plan_id=20]
               +- HashAggregate(keys=[user_id#13, product_id#14], functions=[partial_count(1), partial_sum(score#15), partial_avg(score#15), partial_max(score#15), partial_min(score#15)], output=[user_id#13, product_id#14, count#30L, sum#32, sum#35, count#36L, max#38, min#40])
                  +- LocalTableScan [user_id#13, product_id#14, score#15]
```

<!-- empty-paragraph -->

DISTINCT 처리를 위해 정확히 같은 product\_id들이 같은 노드에 모여야 하므로 (user\_id, product\_id) 기준으로 한 번 더 셔플이 발생한다.

| 셔플 | 파티셔닝 키 | 목적 |
| --- | --- | --- |
| 1st Exchange | (user_id, product_id) | DISTINCT를 위해 동일 product_id가 같은 노드로 집결 |
| 2nd Exchange | user_id | user_id별 최종 집계를 위해 재분산 |

기본적으로 COUNT(DISTINCT)는 Monoid가 아니기 때문에 (user\_id, product\_id)로 재파티셔닝해서 monoid 형태로 만든다.

```
COUNT(DISTINCT product_id per user_id)
  = |{ product_id | (user_id, product_id) 쌍이 존재 }|
  = (user_id, product_id)로 GROUP BY 후 COUNT(1)
```

<!-- empty-paragraph -->

따라서 Physical Plan에 Exchange가 2번 발생하게 된다.

```
1st Exchange (user_id, product_id)
   └─ COUNT(DISTINCT)를 Monoid로 만들기 위한 재파티셔닝

2nd Exchange (user_id)
   └─ user_id별 최종 집계를 위한 재파티셔닝
```

<!-- empty-paragraph -->

#### 집약 함수를 적용한 값과 집약 전의 값을 동시에 다루기

```sql
SELECT 1=1
     , user_id
     , product_id
     -- 개별 리뷰 점수
     , score
     -- 전체 평균 리뷰 점수
     , AVG(score) OVER() AS avg_score
     -- 사용자의 평균 리뷰 점수
     , AVG(score) OVER(PARTITION BY user_id) AS user_avg_score
     -- 개별 리뷰 점수와 사용자 평균 리뷰 점수의 차이
     , score - AVG(score) OVER(PARTITION BY user_id) AS user_avg_score_diff
FROM   review
;
```

<!-- empty-paragraph -->

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
      """SELECT 1=1
              , user_id
              , product_id
              -- 개별 리뷰 점수
              , score
              -- 전체 평균 리뷰 점수
              , AVG(score) OVER() AS avg_score
              -- 사용자의 평균 리뷰 점수
              , AVG(score) OVER(PARTITION BY user_id) AS user_avg_score
              -- 개별 리뷰 점수와 사용자 평균 리뷰 점수의 차이
              , score - AVG(score) OVER(PARTITION BY user_id) AS user_avg_score_diff
         FROM   review
         ;"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Project [unresolvedalias((1 = 1)), 'user_id, 'product_id, 'score, 'AVG('score) windowspecdefinition(unspecifiedframe$()) AS avg_score#16, 'AVG('score) windowspecdefinition('user_id, unspecifiedframe$()) AS user_avg_score#17, ('score - 'AVG('score) windowspecdefinition('user_id, unspecifiedframe$())) AS user_avg_score_diff#18]
+- 'UnresolvedRelation [review], [], false

== Analyzed Logical Plan ==
(1 = 1): boolean, user_id: string, product_id: string, score: double, avg_score: double, user_avg_score: double, user_avg_score_diff: double
Project [(1 = 1)#22, user_id#13, product_id#14, score#15, avg_score#16, user_avg_score#17, user_avg_score_diff#18]
+- Project [(1 = 1)#22, user_id#13, product_id#14, score#15, avg_score#16, user_avg_score#17, _we2#23, avg_score#16, user_avg_score#17, (score#15 - _we2#23) AS user_avg_score_diff#18]
   +- Window [avg(score#15) windowspecdefinition(user_id#13, specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS user_avg_score#17, avg(score#15) windowspecdefinition(user_id#13, specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS _we2#23], [user_id#13]
      +- Window [avg(score#15) windowspecdefinition(specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS avg_score#16]
         +- Project [(1 = 1) AS (1 = 1)#22, user_id#13, product_id#14, score#15]
            +- SubqueryAlias review
               +- View (`review`, [user_id#13, product_id#14, score#15])
                  +- Project [_1#3 AS user_id#13, _2#4 AS product_id#14, _3#5 AS score#15]
                     +- LocalRelation [_1#3, _2#4, _3#5]

== Optimized Logical Plan ==
Project [(1 = 1)#22, user_id#13, product_id#14, score#15, avg_score#16, user_avg_score#17, (score#15 - _we2#23) AS user_avg_score_diff#18]
+- Window [avg(score#15) windowspecdefinition(user_id#13, specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS user_avg_score#17, avg(score#15) windowspecdefinition(user_id#13, specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS _we2#23], [user_id#13]
   +- Window [avg(score#15) windowspecdefinition(specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS avg_score#16]
      +- LocalRelation [(1 = 1)#22, user_id#13, product_id#14, score#15]

== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- Project [(1 = 1)#22, user_id#13, product_id#14, score#15, avg_score#16, user_avg_score#17, (score#15 - _we2#23) AS user_avg_score_diff#18]
   +- Window [avg(score#15) windowspecdefinition(user_id#13, specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS user_avg_score#17, avg(score#15) windowspecdefinition(user_id#13, specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS _we2#23], [user_id#13]
      +- Sort [user_id#13 ASC NULLS FIRST], false, 0
         +- Window [avg(score#15) windowspecdefinition(specifiedwindowframe(RowFrame, unboundedpreceding$(), unboundedfollowing$())) AS avg_score#16]
            +- Exchange SinglePartition, ENSURE_REQUIREMENTS, [plan_id=19]
               +- LocalTableScan [(1 = 1)#22, user_id#13, product_id#14, score#15]
```

<!-- empty-paragraph -->

```
OVER()                      → 전체 1개 파티션 필요 → Exchange SinglePartition (셔플발생)
OVER(PARTITION BY user_id)  → user_id 기준 정렬 후 처리
```

-   `OVER()`(파티션 없는 Window)가 셔플을 유발하는 게 이 플랜의 핵심 비용 지점이다.
    
-   동일 Window spec의 중복 컬럼`user_avg_score`, `_we2`)은 옵티마이저가 하나의 Window 실행으로 통합해준다.
    
-   `isFinalPlan=false` → AQE(Adaptive Query Execution)가 아직 실행 전이라 런타임 통계 반영 전 상태이다.
    

<!-- empty-paragraph -->

OVER(PARTITION BY user\_id)가 셔플 없이 처리되는 이유는, 이미 OVER()가 앞에서 SinglePartition 셔플을 했기 때문이다.