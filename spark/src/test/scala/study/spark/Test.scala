package study.spark

object Test extends SparkTestBase {
  def main(args: Array[String]): Unit = {
    spark.sql("SELECT 1").explain()
  }
}
