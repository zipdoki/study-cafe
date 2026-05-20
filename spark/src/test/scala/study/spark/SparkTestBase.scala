package study.spark

import org.apache.spark.sql.SparkSession
import org.scalatest.funsuite.AnyFunSuite

object SparkTestSession {
  lazy val spark: SparkSession = SparkSession.builder()
    .appName("spark-test")
    .master("local[2]")
    .config("spark.sql.shuffle.partitions", "1")
    .config("spark.ui.enabled", "false")
    .getOrCreate()

  spark.sparkContext.setLogLevel("ERROR")
}

trait SparkTestBase extends AnyFunSuite {
  val spark: SparkSession = SparkTestSession.spark
}
