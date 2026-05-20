<!-- toc -->

# Spark Plan

## Spark Logical Plan 노드 종류

Spark Logical Plan의 노드들은 크게 Relation(데이터 소스), Structural(구조), Operator(변환) 으로 나뉜다.

<!-- empty-paragraph -->

#### Relation: 데이터의 출처

| 노드 | 설명 |
| --- | --- |
| LocalRelation | Seq.toDF() 등 드라이버 메모리 데이터 |
| LogicalRDD | 기존 RDD를 DataFrame으로 변환한 것 |
| HiveTableRelation | Hive 메타스토어의 테이블 |
| LogicalRelation | Parquet, CSV, JDBC 등 외부 데이터소스 |
| InMemoryRelation | .cache() / .persist()로 캐싱된 데이터 |

<!-- empty-paragraph -->

-   LocalRelation: 드라이버가 데이터를 들고 있는 상태
    
-   InMemoryRelation: Executor가 데이터를 들고 있는 상태 (분산 캐시)
    

<!-- empty-paragraph -->

#### Structural: 구조/이름 처리

| 노드 | 설명 |
| --- | --- |
| SubqueryAlias | FROM mst_users 처럼 테이블/서브쿼리에 이름을 붙인 것 |
| View | createOrReplaceTempView()로 등록된 뷰 |
| CTE (WithCTE) | WITH cte AS (...) 구문 |
| UnresolvedRelation | 파싱 단계에서 아직 검증 안 된 테이블 참조 |

<!-- empty-paragraph -->

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

<!-- empty-paragraph -->

#### 예시: 쿼리와 플랜 매핑

```sql
SELECT user_id, count(*) as cnt
FROM   mst_users
WHERE  register_device = 1
GROUP BY user_id
ORDER BY cnt DESC
LIMIT 10
```

<!-- empty-paragraph -->

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

<!-- empty-paragraph -->

## Spark Physical Plan 노드 종류

Catalyst 옵티마이저가 Logical Plan을 Physical Plan으로 변환하면서 실제 실행 방식이 결정된다.

<!-- empty-paragraph -->

#### Scan: 데이터 읽기

| 노드 | 설명 |
| --- | --- |
| LocalTableScan | 드라이버 메모리 데이터 스캔 Seq.toDF(), createOrReplaceTempView |
| FileScan | Parquet, ORC, CSV, JSON 등 파일 스캔 |
| InMemoryTableScan | .cache() / .persist() 된 데이터 스캔 |
| JDBCRelation | JDBC 외부 DB 스캔 |
| HiveTableScan | Hive 테이블 스캔 |

<!-- empty-paragraph -->

#### Aggregate: 집계

| 노드 | 설명 |
| --- | --- |
| HashAggregate | 해시 맵 기반 집계 (일반적인 GROUP BY |
| SortAggregate | 정렬 기반 집계 (해시 불가한 타입에 사용) |
| ObjectHashAggregate | Python UDF/UDAF 등 객체 기반 집계 |

<!-- empty-paragraph -->

#### Join: 조인

| 노드 | 설명 |
| --- | --- |
| BroadcastHashJoin | 작은 테이블을 브로드캐스트해서 해시 조인 |
| SortMergeJoin | 양쪽을 정렬 후 병합 조인 (대용량 테이블) |
| BroadcastNestedLoopJoin | 중첩 루프 조인 (조건 없는 Cross Join 등) |
| ShuffledHashJoin | Shuffle 후 해시 조인 |

<!-- empty-paragraph -->

#### Exchange: 데이터 이동 (Shuffle)

| 노드 | 설명 |
| --- | --- |
| Exchange | 파티션 간 데이터 재분배 (Shuffle 발생) |
| BroadcastExchange | 브로드캐스트용 데이터 전송 |
| ShuffleQueryStage | AQE(Adaptive Query Execution) 적용 시 Exchange 래퍼 |

<!-- empty-paragraph -->

#### Sort / Limit

| 노드 | 설명 |
| --- | --- |
| Sort | 정렬 ORDER BY |
| TakeOrderedAndProject | ORDER BY ... LIMIT n 최적화 — 전체 정렬 없이 Top-N만 추출 |
| CollectLimit | LIMIT n — 드라이버로 수집 |

<!-- empty-paragraph -->

분산 환경에서는 Sort가 반드시 셔플을 유발한다.

<!-- empty-paragraph -->

\[왜 셔플이 필요한가?\]

Spark 데이터는 여러 파티션에 분산되어 있습니다.

Partition 0: \[2023, 2021, ...\]

Partition 1: \[2022, 2024, ...\]

<!-- empty-paragraph -->

각 파티션 내부만 정렬해서는 전체 정렬(global sort) 이 보장되지 않는다.

1.  `Exchange (rangepartitioning)`: 값의 범위에 따라 데이터를 재분배
    
    -   작은 값 → Partition 0, 큰 값 → Partition 1 식으로
        
2.  `Sort`: 재분배된 각 파티션 내부를 정렬
    

결과적으로 파티션 간 순서가 보장됩니다.

<!-- empty-paragraph -->

\[셔플이 안 일어나는 경우\]

-   파티션이 1개: 이미 한 곳에 있으므로 재분배 불필요
    
-   `sortWithinPartitions()`: 파티션 내부만 정렬, 전체 순서 보장 안 함
    
-   이미 해당 키로 파티셔닝됨: 재분배 생략 가능
    

<!-- empty-paragraph -->

#### 기타

| 노드 | 설명 |
| --- | --- |
| Project | 컬럼 선택/표현식 계산 |
| Filter | 조건 필터 |
| Window | 윈도우 함수 실행 |
| Generate | explode() 등 행 생성 |
| WholeStageCodegen | 여러 연산을 하나의 JVM 코드로 묶어 실행 (성능 최적화) |

<!-- empty-paragraph -->

## Logical와 Physical 비교

| 개념 | Logical Plan | Physical Plan |
| --- | --- | --- |
| 관심사 | 무엇을(What) | 어떻게(How) |
| Join | Join | BroadcastHashJoin, SortMergeJoin 등 |
| 집계 | Aggregate | HashAggregate, SortAggregate 등 |
| 데이터 소스 | LocalRelation, LogicalRelation | LocalTableScan, FileScan 등 |
| Shuffle | 없음 | Exchange |

<!-- empty-paragraph -->