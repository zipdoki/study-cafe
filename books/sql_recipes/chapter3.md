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