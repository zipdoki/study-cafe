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