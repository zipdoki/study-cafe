<!-- toc -->

# 3장 데이터 가공을 위한 SQL

## 5장 하나의 값 조작하기

데이터를 분석해 적합한 형태로 가공하는 방법

데이터를 가공해야 하는 이유

1.  다룰 데이터가 데이터 분석 용도로 상정되지 않은 경우
    
2.  연산할 때 비교 가능한 상태로 만들고 오류를 회피하기 위한 경우
    

<!-- empty-paragraph -->

### 1\. 코드 값을 레이블로 변경하기

로그 데이터 또는 업무 데이터로 저장된 코드 값은 가독성을 위해 리포트에 작성할 때 변환하는 등의 작업을 해야 하는데, 집계할 때 미리 코드 값을 레이블로 변경하는 방법을 살펴본다.

회원 등록 때 사용한 장치를 저장하는 컬럼(register\_device)이 코드 값(1: 데스크톱, 2: 스마트폰, 3: 애플리케이션)으로 저장되어 있다.

```
user_id | register_date | register_device
--------------------------------------------
u001    | 2016-08-26    | 1
u002    | 2016-08-26    | 2
u003    | 2016-08-27    | 3
```

<!-- empty-paragraph -->

```sql
SELECT
  user_id
  , CASE
      WHEN register_device = 1 THEN '데스크톱'
      WHEN register_device = 2 THEN '스마트폰'
      WHEN register_device = 3 THEN '애플리케이션'
    END AS device_name
FROM mst_users
;
```

<!-- empty-paragraph -->

```scala
package study.spark

object Test extends SparkTestBase {
  import spark.implicits._

  def main(args: Array[String]): Unit = {
    Seq(
      (1, 1),
      (2, 2),
      (3, 3),
      (4, 1)
    ).toDF("user_id", "register_device")
      .createOrReplaceTempView("mst_users")

    spark.sql(
      """SELECT
         user_id
         , CASE
         WHEN register_device = 1 THEN '데스크톱'
         WHEN register_device = 2 THEN '스마트폰'
         WHEN register_device = 3 THEN '애플리케이션'
         END AS device_name
         FROM mst_users"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

Parsed Logical Plan (파싱 단계)

```
== Parsed Logical Plan ==
'Project ['user_id, CASE WHEN ('register_device = 1) THEN 데스크톱 WHEN ('register_device = 2) THEN 스마트폰 WHEN ('register_device = 3) THEN 애플리케이션 END AS device_name#11]
+- 'UnresolvedRelation [mst_users], [], false
```

`'UnresolvedRelation [mst_users]` SQL 문자열을 AST로 변환한 단계. ' 접두어(e.g. `'user_id`, `'register_device`)는 아직 이름만 알고 실제 컬럼인지는 모르는 상태이다. `mst_users`도 실제 테이블인지 검증 전이다.

<!-- empty-paragraph -->

Analyzed Logical Plan (분석 단계)

```
== Analyzed Logical Plan ==
user_id: int, device_name: string
Project [user_id#9, CASE WHEN (register_device#10 = 1) THEN 데스크톱 WHEN (register_device#10 = 2) THEN 스마트폰 WHEN (register_device#10 = 3) THEN 애플리케이션 END AS device_name#11]
+- SubqueryAlias mst_users
   +- View (`mst_users`, [user_id#9, register_device#10])
      +- Project [_1#2 AS user_id#9, _2#3 AS register_device#10]
         +- LocalRelation [_1#2, _2#3]
```

Catalog를 조회해서 ' 접두어가 사라지고 타입이 확정된다. `mst_users` 가 실제로는 `Seq`로 만든 `LocalRelation(_1, 2)` 을 `user_id`, `register_device`로 alias한 View임이 드러난다.

<!-- empty-paragraph -->

Optimized Logical Plan (최적화 단계)

```
== Optimized Logical Plan ==
LocalRelation [user_id#9, device_name#11]
```

Catalyst 옵티마이저가 중간 단계들을 전부 제거하고 데이터를 그냥 메모리에서 바로 읽는 것으로 축약했다. View, SubqueryAlias, Project 레이어가 모두 사라졌다.

<!-- empty-paragraph -->

Physical Plan (물리 플랜)

```
== Physical Plan ==
LocalTableScan [user_id#9, device_name#11]
```

실제 실행 방식이다. LocalTableScan은 네트워크/디스크 I/O 없이 드라이버 메모리에 있는 데이터를 그대로 스캔하는 가장 단순한 실행이다. `Seq`로 만든 데이터라 Shuffle도 없다.

\-> 이 쿼리는 로컬 메모리 데이터라 옵티마이저가 모든 중간 단계를 제거하고 LocalTableScan 하나로 처리한다.

<!-- empty-paragraph -->

### 2\. URL에서 요소 추출하기

#### 레퍼러로 어떤 웹 페이지를 거쳐 넘어왔는지 판별하기

```sql
SELECT stamp
     , substring(referrer from 'https?://([^/]*') AS referrer_host
     , regexp_replace(regexp_substr(referrer, 'https?://[^/]*'), 'https?://', '')
     , parse_url(referrer, 'HOST') AS referrer_host
     , host(referrer) AS referrer_host
FROM access_log
;
```

<!-- empty-paragraph -->

```scala
package study.spark

object Test extends SparkTestBase {
  import spark.implicits._

  def main(args: Array[String]): Unit = {
    Seq(
      ("2024-01-01 00:00:00", "https://www.google.com/search?q=spark"),
      ("2024-01-01 00:01:00", "https://github.com/apache/spark"),
      ("2024-01-01 00:02:00", "http://stackoverflow.com/questions/12345"),
      ("2024-01-01 00:03:00", null)
    ).toDF("stamp", "referrer").createOrReplaceTempView("access_log")

    spark.sql(
      """SELECT stamp
     , substring(referrer from 'https?://([^/]*') AS referrer_host
     , regexp_replace(regexp_substr(referrer, 'https?://[^/]*'), 'https?://', '') AS referrer_host2
     , parse_url(referrer, 'HOST') AS referrer_host3
      FROM access_log"""
    ).show(truncate = false)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Project ['stamp, 'regexp_extract('referrer, https?://([^/]*), 1) AS referrer_host#11, 'regexp_replace('regexp_substr('referrer, https?://[^/]*), https?://, ) AS referrer_host2#12, 'parse_url('referrer, HOST) AS referrer_host3#13]
+- 'UnresolvedRelation [access_log], [], false

== Analyzed Logical Plan ==
stamp: string, referrer_host: string, referrer_host2: string, referrer_host3: string
Project [stamp#9, regexp_extract(referrer#10, https?://([^/]*), 1) AS referrer_host#11, regexp_replace(regexp_substr(referrer#10, https?://[^/]*), https?://, , 1) AS referrer_host2#12, parse_url(referrer#10, HOST, true) AS referrer_host3#13]
+- SubqueryAlias access_log
   +- View (`access_log`, [stamp#9, referrer#10])
      +- Project [_1#2 AS stamp#9, _2#3 AS referrer#10]
         +- LocalRelation [_1#2, _2#3]

== Optimized Logical Plan ==
LocalRelation [stamp#9, referrer_host#11, referrer_host2#12, referrer_host3#13]

== Physical Plan ==
LocalTableScan [stamp#9, referrer_host#11, referrer_host2#12, referrer_host3#13]
```

<!-- empty-paragraph -->

#### 날짜/시각에서 특정 필드 추출하기

```sql
SELECT stamp
     , YEAR(stamp)  AS year
     , MONTH(stamp) AS month
     , DAY(stamp)   AS day
     , HOUR(stamp)  AS hour
FROM
      (SELECT CAST('2016-01-30 12:00:00' AS timestamp) AS stamp) AS t
;
```

<!-- empty-paragraph -->

```scala
package study.spark

object Test extends SparkTestBase {
  def main(args: Array[String]): Unit = {
    spark.sql(
      """SELECT stamp
              , YEAR(stamp)  AS year
              , MONTH(stamp) AS month
              , DAY(stamp)   AS day
              , HOUR(stamp)  AS hour
         FROM
            (SELECT CAST('2016-01-30 12:00:00' AS timestamp) AS stamp) AS t"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Project ['stamp, 'YEAR('stamp) AS year#1, 'MONTH('stamp) AS month#2, 'DAY('stamp) AS day#3, 'HOUR('stamp) AS hour#4]
+- 'SubqueryAlias t
   +- 'Project [cast(2016-01-30 12:00:00 as timestamp) AS stamp#0]
      +- OneRowRelation
```

OneRowRelation: Spark SQL에서 FROM 없이 SELECT만 쓰면, "행이 정확히 1개인 빈 소스"에서 읽는다고 해석한다.

-   컬럼 없음, 행 1개짜리 가상 테이블
    
-   그 위에 CAST('2016-01-30 12:00:00' AS timestamp) 를 프로젝션
    
-   결과: stamp 컬럼 1개, 행 1개
    

즉 Spark 파서가 SELECT (FROM 없음) 패턴을 만나면 자동으로 OneRowRelation을 소스로 삽입한다.

<!-- empty-paragraph -->

```
== Analyzed Logical Plan ==
stamp: timestamp, year: int, month: int, day: int, hour: int
Project [stamp#0, year(cast(stamp#0 as date)) AS year#1, month(cast(stamp#0 as date)) AS month#2, day(cast(stamp#0 as date)) AS day#3, hour(stamp#0, Some(Asia/Seoul)) AS hour#4]
+- SubqueryAlias t
   +- Project [cast(2016-01-30 12:00:00 as timestamp) AS stamp#0]
      +- OneRowRelation
```

<!-- empty-paragraph -->

```
== Optimized Logical Plan ==
Project [2016-01-30 12:00:00 AS stamp#0, 2016 AS year#1, 1 AS month#2, 30 AS day#3, 12 AS hour#4]
+- OneRowRelation
```

Catalyst Optimizer가 상수 폴딩(Constant Folding) 을 적용한 단계. 입력이 리터럴 상수이므로 YEAR(...), MONTH(...) 등을 실행 시 계산하지 않고 컴파일 타임에 미리 계산해서 2016, 1, 30, 12로 치환한다.

<!-- empty-paragraph -->

```
== Physical Plan ==
*(1) Project [2016-01-30 12:00:00 AS stamp#0, 2016 AS year#1, 1 AS month#2, 30 AS day#3, 12 AS hour#4]
+- *(1) Scan OneRowRelation[]
```

<!-- empty-paragraph -->

→ 상수 리터럴이 입력이라 Catalyst가 모든 날짜 함수를 컴파일 타임에 계산해버렸고, 실제 실행은 단순 상수 출력만 하는 매우 최적화된 플랜이 된다.

상수 리터럴 입력: Catalyst Optimizer 입장에서

-   컬럼값: 실행 시점에 각 행마다 다른 값이 들어오므로 미리 계산 불가
    
-   리터럴: 실행 전에 이미 값이 확정되어 있으므로 미리 계산 가능
    

그래서 YEAR('2016-01-30 12:00:00') 같은 표현식은 실행 전에 2016으로 대체할 수 있고, 이걸 상수 폴딩(Constant Folding) 이라고 한다. Optimized Plan에서 함수 호출 없이 숫자가 바로 나온 이유이다.

<!-- empty-paragraph -->

## 6강 여러 개의 값에 대한 조작

### 1\. 문자열 연결하기

```sql
SELECT user_id
     , CONCAT(pref_name, city_name) AS pref_city
FROM   mst_user_location
;
```

<!-- empty-paragraph -->

```scala
package study.spark

object Test extends SparkTestBase {
  def main(args: Array[String]): Unit = {
    import spark.implicits._

    Seq(
      (1, "서울특별시", "강남구"),
      (2, "경기도", "수원시"),
      (3, "부산광역시", "해운대구")
    ).toDF("user_id", "pref_name", "city_name")
      .createOrReplaceTempView("mst_user_location")

    spark.sql(
      """SELECT user_id
              , CONCAT(pref_name, city_name) AS pref_city
         FROM   mst_user_location"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Project ['user_id, 'CONCAT('pref_name, 'city_name) AS pref_city#16]
+- 'UnresolvedRelation [mst_user_location], [], false

== Analyzed Logical Plan ==
user_id: int, pref_city: string
Project [user_id#13, concat(pref_name#14, city_name#15) AS pref_city#16]
+- SubqueryAlias mst_user_location
   +- View (`mst_user_location`, [user_id#13, pref_name#14, city_name#15])
      +- Project [_1#3 AS user_id#13, _2#4 AS pref_name#14, _3#5 AS city_name#15]
         +- LocalRelation [_1#3, _2#4, _3#5]

== Optimized Logical Plan ==
LocalRelation [user_id#13, pref_city#16]

== Physical Plan ==
LocalTableScan [user_id#13, pref_city#16]
```

<!-- empty-paragraph -->

### 2\. 여러 개의 값 비교하기

#### 분기별 매출 증감 판정하기

```sql
SELECT year
     , q1
     , q2
     , CASE
        WHEN q1 < q2 THEN '+'
        WHEN q1 = q2 THEN ' '
        ELSE '-'
       END AS judge_q1_q2
     , q2 - q1 AS diff_q2_q1
     , SIGN(q2 - q1) AS sign_q2_q1
FROM  quarterly_sales
ORDER BY year
;
```

<!-- empty-paragraph -->

```scala
package study.spark

object Test extends SparkTestBase {
  def main(args: Array[String]): Unit = {
    import spark.implicits._

    Seq[(Int, Int, Int, Option[Int], Option[Int])](
      (2015, 82000, 83000, Some(78000), Some(83000)),
      (2016, 85000, 85000, Some(80000), Some(81000)),
      (2017, 92000, 81000, None, None),
    ).toDF("year", "q1", "q2", "q3", "q4")
      .createOrReplaceTempView("quarterly_sales")

    spark.sql(
      """SELECT year
              , q1
              , q2
              , CASE
                 WHEN q1 < q2 THEN '+'
                 WHEN q1 = q2 THEN ' '
                 ELSE '-'
                END AS judge_q1_q2
              , q2 - q1 AS diff_q2_q1
              , SIGN(q2 - q1) AS sign_q2_q1
         FROM  quarterly_sales
         ORDER BY year"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Sort ['year ASC NULLS FIRST], true
+- 'Project ['year, 'q1, 'q2, CASE WHEN ('q1 < 'q2) THEN + WHEN ('q1 = 'q2) THEN   ELSE - END AS judge_q1_q2#26, ('q2 - 'q1) AS diff_q2_q1#27, 'SIGN(('q2 - 'q1)) AS sign_q2_q1#28]
   +- 'UnresolvedRelation [quarterly_sales], [], false
```

<!-- empty-paragraph -->

```
== Analyzed Logical Plan ==
year: int, q1: int, q2: int, judge_q1_q2: string, diff_q2_q1: int, sign_q2_q1: double
Sort [year#21 ASC NULLS FIRST], true
+- Project [year#21, q1#22, q2#23, CASE WHEN (q1#22 < q2#23) THEN + WHEN (q1#22 = q2#23) THEN   ELSE - END AS judge_q1_q2#26, (q2#23 - q1#22) AS diff_q2_q1#27, sign(cast((q2#23 - q1#22) as double)) AS sign_q2_q1#28]
   +- SubqueryAlias quarterly_sales
      +- View (`quarterly_sales`, [year#21, q1#22, q2#23, q3#24, q4#25])
         +- Project [_1#5 AS year#21, _2#6 AS q1#22, _3#7 AS q2#23, _4#8 AS q3#24, _5#9 AS q4#25]
            +- LocalRelation [_1#5, _2#6, _3#7, _4#8, _5#9]
```

<!-- empty-paragraph -->

```
== Optimized Logical Plan ==
Sort [year#21 ASC NULLS FIRST], true
+- LocalRelation [year#21, q1#22, q2#23, judge_q1_q2#26, diff_q2_q1#27, sign_q2_q1#28]
```

데이터가 인메모리(LocalRelation)이므로 I/O 없이 바로 처리 가능

<!-- empty-paragraph -->

```
== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- Sort [year#21 ASC NULLS FIRST], true, 0
   +- Exchange rangepartitioning(year#21 ASC NULLS FIRST, 2), ENSURE_REQUIREMENTS, [plan_id=11]
      +- LocalTableScan [year#21, q1#22, q2#23, judge_q1_q2#26, diff_q2_q1#27, sign_q2_q1#28]
```

AdaptiveSparkPlan (AQE 활성화)

└─ Sort \[year ASC\]

└─ Exchange rangepartitioning(year ASC, 2파티션) ← 셔플

└─ LocalTableScan

<!-- empty-paragraph -->

-   `LocalTableScan`: 인메모리 데이터 스캔
    
-   `Exchange rangepartitioning`: 정렬을 위한 셔플 발생 (파티션 2개)
    
-   `Sort`: 각 파티션 내 정렬
    
-   `AdaptiveSparkPlan isFinalPlan=false`: AQE가 아직 실행 전이므로 실행 중 통계에 따라 플랜이 바뀔 수 있음
    

<!-- empty-paragraph -->

\[이번 플랜에서 특이한 점\]

`Exchange rangepartitioning(year ASC, 2파티션)`

-   데이터가 LocalRelation(인메모리, 단일 노드)임에도 셔플이 발생했다. 이건 `spark.sql.shuffle.partitions` 기본값이 200이라 2파티션으로 줄었지만, 그래도 Exchange 자체는 생긴 것이다.
    
-   소량 데이터라면 `spark.conf.set("spark.sql.shuffle.partitions", "1")` 로 파티션을 1개로 설정하면 Exchange가 제거된다.
    

<!-- empty-paragraph -->

#### 연간 평균 4분기 매출 계산하기

```sql
SELECT year
     , (COALESCE(q1, 0) + COALESCE(q2, 0) + COALESCE(q3, 0) + COALESCE(q4, 0)) / 4 AS average
FROM   quarterly_sales
ORDER BY year
;
```

<!-- empty-paragraph -->

```scala
package study.spark

object Test extends SparkTestBase {
  def main(args: Array[String]): Unit = {
    import spark.implicits._

    Seq[(Int, Int, Int, Option[Int], Option[Int])](
      (2015, 82000, 83000, Some(78000), Some(83000)),
      (2016, 85000, 85000, Some(80000), Some(81000)),
      (2017, 92000, 81000, None, None),
    ).toDF("year", "q1", "q2", "q3", "q4")
      .createOrReplaceTempView("quarterly_sales")

    spark.sql(
      """SELECT year
              , (COALESCE(q1, 0) + COALESCE(q2, 0) + COALESCE(q3, 0) + COALESCE(q4, 0)) / 4 AS average
         FROM   quarterly_sales
         ORDER BY year"""
    ).explain(true)
  }
}
```

<!-- empty-paragraph -->

```
== Parsed Logical Plan ==
'Sort ['year ASC NULLS FIRST], true
+- 'Project ['year, (((('COALESCE('q1, 0) + 'COALESCE('q2, 0)) + 'COALESCE('q3, 0)) + 'COALESCE('q4, 0)) / 4) AS average#26]
   +- 'UnresolvedRelation [quarterly_sales], [], false
```

<!-- empty-paragraph -->

```
== Analyzed Logical Plan ==
year: int, average: double
Sort [year#21 ASC NULLS FIRST], true
+- Project [year#21, (cast((((coalesce(q1#22, 0) + coalesce(q2#23, 0)) + coalesce(q3#24, 0)) + coalesce(q4#25, 0)) as double) / cast(4 as double)) AS average#26]
   +- SubqueryAlias quarterly_sales
      +- View (`quarterly_sales`, [year#21, q1#22, q2#23, q3#24, q4#25])
         +- Project [_1#5 AS year#21, _2#6 AS q1#22, _3#7 AS q2#23, _4#8 AS q3#24, _5#9 AS q4#25]
            +- LocalRelation [_1#5, _2#6, _3#7, _4#8, _5#9]
```

<!-- empty-paragraph -->

```
== Optimized Logical Plan ==
Sort [year#21 ASC NULLS FIRST], true
+- LocalRelation [year#21, average#26]
```

<!-- empty-paragraph -->

```
== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- Sort [year#21 ASC NULLS FIRST], true, 0
   +- Exchange rangepartitioning(year#21 ASC NULLS FIRST, 1), ENSURE_REQUIREMENTS, [plan_id=11]
      +- LocalTableScan [year#21, average#26]
```

<!-- empty-paragraph -->

coalesce는 네트워크 전송 없이 인접한 파티션을 그냥 합친다. 데이터가 이동하지 않고 파티션 경계만 재정의되는 개념이다.

Partition 0: \[A, B\] ─┐

Partition 1: \[C, D\] ─┤→ Partition 0: \[A, B, C, D, E, F\]

Partition 2: \[E, F\] ─┘

<!-- empty-paragraph -->

단, 셔플이 없는 대신 데이터가 불균등할 수 있다. 원본이 이미 불균등하면 합쳐도 불균등하다.

Partition 0: 데이터 100만 건 ─┐

Partition 1: 데이터 1건 ─┘→ Partition 0: 100만 1건

<!-- empty-paragraph -->

균등하게 줄이고 싶다면 repartition을 써야 한다.

<!-- empty-paragraph -->

| ​ | coalesce | repartition |
| --- | --- | --- |
| 셔플 | X | O |
| 파티션 수 | 줄이기만 가능 | 줄이기/늘리기 모두 가능 |
| 방식 | 인접 파티션을 합침 | 데이터를 균등 재분배 |
| 속도 | 빠름 | 느림 |

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