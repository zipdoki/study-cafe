# 3장 데이터 가공을 위한 SQL

## 5장 하나의 값 조작하기

데이터를 분석해 적합한 형태로 가공하는 방법

데이터를 가공해야 하는 이유

1.  다룰 데이터가 데이터 분석 용도로 상정되지 않은 경우
    
2.  연산할 때 비교 가능한 상태로 만들고 오류를 회피하기 위한 경우
    

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

<p></p>

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

<p></p>

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

<p></p>

Parsed Logical Plan (파싱 단계)

```
== Parsed Logical Plan ==
'Project ['user_id, CASE WHEN ('register_device = 1) THEN 데스크톱 WHEN ('register_device = 2) THEN 스마트폰 WHEN ('register_device = 3) THEN 애플리케이션 END AS device_name#11]
+- 'UnresolvedRelation [mst_users], [], false
```

`'UnresolvedRelation [mst_users]` SQL 문자열을 AST로 변환한 단계. ' 접두어(e.g. `'user_id`, `'register_device`)는 아직 이름만 알고 실제 컬럼인지는 모르는 상태이다. `mst_users`도 실제 테이블인지 검증 전이다.

<p></p>

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

<p></p>

Optimized Logical Plan (최적화 단계)

```
== Optimized Logical Plan ==
LocalRelation [user_id#9, device_name#11]
```

Catalyst 옵티마이저가 중간 단계들을 전부 제거하고 데이터를 그냥 메모리에서 바로 읽는 것으로 축약했다. View, SubqueryAlias, Project 레이어가 모두 사라졌다.

<p></p>

Physical Plan (물리 플랜)

```
== Physical Plan ==
LocalTableScan [user_id#9, device_name#11]
```

실제 실행 방식이다. LocalTableScan은 네트워크/디스크 I/O 없이 드라이버 메모리에 있는 데이터를 그대로 스캔하는 가장 단순한 실행이다. `Seq`로 만든 데이터라 Shuffle도 없다.

\-> 이 쿼리는 로컬 메모리 데이터라 옵티마이저가 모든 중간 단계를 제거하고 LocalTableScan 하나로 처리한다.

<p></p>

* * *

## Spark Plan

### Spark Logical Plan 노드 종류

Spark Logical Plan의 노드들은 크게 **Relation(데이터 소스)**, **Structural(구조)**, **Operator(변환)** 으로 나뉜다.

<p></p>

#### Relation: 데이터의 출처

| 노드 | 설명 |
| --- | --- |
| LocalRelation | Seq.toDF() 등 드라이버 메모리 데이터 |
| LogicalRDD | 기존 RDD를 DataFrame으로 변환한 것 |
| HiveTableRelation | Hive 메타스토어의 테이블 |
| LogicalRelation | Parquet, CSV, JDBC 등 외부 데이터소스 |
| InMemoryRelation | .cache() / .persist()로 캐싱된 데이터 |

<p></p>

#### Structural: 구조/이름 처리

| 노드 | 설명 |
| --- | --- |
| SubqueryAlias | FROM mst_users 처럼 테이블/서브쿼리에 이름을 붙인 것 |
| View | createOrReplaceTempView()로 등록된 뷰 |
| CTE (WithCTE) | WITH cte AS (...) 구문 |
| UnresolvedRelation | 파싱 단계에서 아직 검증 안 된 테이블 참조 |

<p></p>

#### Operator: 데이터 변환

| 노드 | 설명 |
| --- | --- |
| Project | SELECT col1, col2 — 컬럼 선택/표현식 |
| Filter | WHERE 조건 |
| Aggregate | GROUP BY + 집계함수 |
| Join | JOIN — Inner/Left/Right/Full 등 |
| Sort | ORDER BY |
| Limit | LIMIT n |
| Distinct | SELECT DISTINCT |
| Union | UNION ALL |
| Except | Intersect \| EXCEPT / INTERSECT |
| Window | OVER (PARTITION BY ... ORDER BY ...) |
| Expand | GROUPING SETS, CUBE, ROLLUP |
| Generate | explode(), posexplode() 등 행 생성 |
| Repartition | .repartition() / .coalesce() |
| GlobalLimit / LocalLimit | Analyzed 단계에서 LIMIT이 두 개로 분리됨 |

<p></p>

#### 예시: 쿼리와 플랜 매핑

```sql
SELECT user_id, count(*) as cnt
FROM   mst_users
WHERE  register_device = 1
GROUP BY user_id
ORDER BY cnt DESC
LIMIT 10
```

<p></p>

```
GlobalLimit 10
+- LocalLimit 10
   +- Sort [cnt DESC]
      +- Aggregate [user_id], [user_id, count(*) AS cnt]
         +- Filter (register_device = 1)
            +- SubqueryAlias mst_users
               +- View (...)
                  +- LocalRelation [...]
```

트리 구조로 아래(Relation)에서 위(Limit)로 데이터가 흐른다.

<p></p>

### Spark Physical Plan 노드 종류

Catalyst 옵티마이저가 Logical Plan을 Physical Plan으로 변환하면서 실제 실행 방식이 결정된다.

<p></p>

#### Scan: 데이터 읽기

| 노드 | 설명 |
| --- | --- |
| LocalTableScan | 드라이버 메모리 데이터 스캔 Seq.toDF(), createOrReplaceTempView |
| FileScan | Parquet, ORC, CSV, JSON 등 파일 스캔 |
| InMemoryTableScan | .cache() / .persist() 된 데이터 스캔 |
| JDBCRelation | JDBC 외부 DB 스캔 |
| HiveTableScan | Hive 테이블 스캔 |

<p></p>

#### Aggregate: 집계

| 노드 | 설명 |
| --- | --- |
| HashAggregate | 해시 맵 기반 집계 (일반적인 GROUP BY |
| SortAggregate | 정렬 기반 집계 (해시 불가한 타입에 사용) |
| ObjectHashAggregate | Python UDF/UDAF 등 객체 기반 집계 |

<p></p>

#### Join: 조인

| 노드 | 설명 |
| --- | --- |
| BroadcastHashJoin | 작은 테이블을 브로드캐스트해서 해시 조인 |
| SortMergeJoin | 양쪽을 정렬 후 병합 조인 (대용량 테이블) |
| BroadcastNestedLoopJoin | 중첩 루프 조인 (조건 없는 Cross Join 등) |
| ShuffledHashJoin | Shuffle 후 해시 조인 |

<p></p>

#### Exchange: 데이터 이동 (Shuffle)

| 노드 | 설명 |
| --- | --- |
| Exchange | 파티션 간 데이터 재분배 (Shuffle 발생) |
| BroadcastExchange | 브로드캐스트용 데이터 전송 |
| ShuffleQueryStage | AQE(Adaptive Query Execution) 적용 시 Exchange 래퍼 |

<p></p>

#### Sort / Limit

| 노드 | 설명 |
| --- | --- |
| Sort | 정렬 ORDER BY |
| TakeOrderedAndProject | ORDER BY ... LIMIT n 최적화 — 전체 정렬 없이 Top-N만 추출 |
| CollectLimit | LIMIT n — 드라이버로 수집 |

<p></p>

#### 기타

| 노드 | 설명 |
| --- | --- |
| Project | 컬럼 선택/표현식 계산 |
| Filter | 조건 필터 |
| Window | 윈도우 함수 실행 |
| Generate | explode() 등 행 생성 |
| WholeStageCodegen | 여러 연산을 하나의 JVM 코드로 묶어 실행 (성능 최적화) |

<p></p>

### Logical와 Physical 비교

| 개념 | Logical Plan | Physical Plan |
| --- | --- | --- |
| 관심사 | 무엇을(What) | 어떻게(How) |
| Join | Join | BroadcastHashJoin, SortMergeJoin 등 |
| 집계 | Aggregate | HashAggregate, SortAggregate 등 |
| 데이터 소스 | LocalRelation, LogicalRelation | LocalTableScan, FileScan 등 |
| Shuffle | 없음 | Exchange |

<p></p>

* * *

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

<p></p>

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

<p></p>

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

<p></p>

<p></p>

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

<p></p>

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

<p></p>

```
== Parsed Logical Plan ==
'Project ['stamp, 'YEAR('stamp) AS year#1, 'MONTH('stamp) AS month#2, 'DAY('stamp) AS day#3, 'HOUR('stamp) AS hour#4]
+- 'SubqueryAlias t
   +- 'Project [cast(2016-01-30 12:00:00 as timestamp) AS stamp#0]
      +- OneRowRelation
```

<p></p>

```
== Analyzed Logical Plan ==
stamp: timestamp, year: int, month: int, day: int, hour: int
Project [stamp#0, year(cast(stamp#0 as date)) AS year#1, month(cast(stamp#0 as date)) AS month#2, day(cast(stamp#0 as date)) AS day#3, hour(stamp#0, Some(Asia/Seoul)) AS hour#4]
+- SubqueryAlias t
   +- Project [cast(2016-01-30 12:00:00 as timestamp) AS stamp#0]
      +- OneRowRelation
```

<p></p>

```
== Optimized Logical Plan ==
Project [2016-01-30 12:00:00 AS stamp#0, 2016 AS year#1, 1 AS month#2, 30 AS day#3, 12 AS hour#4]
+- OneRowRelation
```

<p></p>

```
== Physical Plan ==
*(1) Project [2016-01-30 12:00:00 AS stamp#0, 2016 AS year#1, 1 AS month#2, 30 AS day#3, 12 AS hour#4]
+- *(1) Scan OneRowRelation[]
```

<p></p>