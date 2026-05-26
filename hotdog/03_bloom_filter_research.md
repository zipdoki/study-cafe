<!-- toc -->

# Monoid

모노이드는 대수학에서 나온 개념인데, 프로그래밍에서도 자주 쓰인다. 아주 간단한 규칙 3가지만 지키면 된다.

<!-- empty-paragraph -->

## Monoid의 조건

어떤 집합 + 연산이 있을 때, 아래 세 가지를 만족하면 Monoid이다.

<!-- empty-paragraph -->

### 1\. 닫혀 있다 (Closure)

연산 결과가 항상 같은 집합 안에 있어야 한다

```
정수 + 정수 = 정수
```

<!-- empty-paragraph -->

### 2\. 결합법칙 (Associativity)

괄호를 어디에 치든 결과가 같아야 한다.

```
(1 + 2) + 3 = 1 + (2 + 3)
```

<!-- empty-paragraph -->

### 3\. 항등원이 있다 (Identity Element)

"아무것도 안 하는" 값이 존재해야 한다.

```
0 + 5 = 5,   5 + 0 = 5  →  0이 항등원
```

## 예시

| 집합 | 연산 | 항등원 | 모노이드 여부 |
| --- | --- | --- | --- |
| 정수 | + | 0 | O |
| 정수 | x | 1 | O |
| 문자열 | +(연결) | "" | O |
| 리스트 | ++(연결) | [] | O |
| 정수 | - | X | X |

<!-- empty-paragraph -->

## Monoid가 가능하게 하는 것

1.  병렬 처리 가능하다: 결합법칙 덕분에 순서 상관없이 나눠서 계산
    
2.  reduce/fold 연산으로 리스트 합치기
    
3.  항등원을 기본값으로 쓰면 되기 때문에 빈 케이스를 처리하기 쉽다.
    

<!-- empty-paragraph -->

```javascript
["Hello", " ", "World"].reduce((a, b) => a + b, "")
// → "Hello World"

[1, 2, 3, 4, 5].reduce((a, b) => a + b, 0)
// → 15
```

# HyperLogLog

HyperLogLog은 카디널리티 추정 알고리즘이다. 즉, 중복을 세지 않고 집합에 몇 가지 고유 원소가 있는지 빠르게 근사한다. Monoid 관점으로 보면 그 구조가 매우 깔끔하게 드러난다.

<!-- empty-paragraph -->

## 핵심 개념

로그 1억 건에서 고유 유저 수를 세고 싶다. 이를 정확히 세려면 모든 ID를 Set에 넣는 것을 생각할 수 있는데, 문제는 이 방법은 메모리를 엄청나게 사용해야 한다는 것이다.

이 때 HyperLogLog를 사용해 고유 유저의 수를 추정할 수 있다. HyperLogLog는 정확도를 조금 포기하고, 아주 적은 메모리(몇 KB)로 오차 ~1% 이내로 추정하는 방법이다.

HyperLogLog의 아이디어를 사용해 원소를 Set에 저장하는 대신 해시값의 앞 비트로 여러 레지스터 중 하나를 선택하고, 나머지 비트의 선행 0 개수를 해당 레지스터에 max로 기록하는 방법을 사용하면 적은 메모리로도 고유 유저 수를 추정할 수 있다.

<!-- empty-paragraph -->

## HyperLogLog는 Monoid다

<!-- empty-paragraph -->

![](https://raw.githubusercontent.com/zipdoki/study-cafe/pages/images/1779821776963.png)

<!-- empty-paragraph -->

### 1단계. 해시 & 레지스터 업데이트

원소 하나가 들어올 때

-   해시값의 앞 `b`비트 → 어떤 버킷(레지스터)으로 갈지 결정
    
-   나머지 비트에서 선행 0 개수 세기 → 그 레지스터의 값을 `max`로 업데이트
    

<!-- empty-paragraph -->

→ 선행 0이 5개면 '약 2⁵ = 32개쯤 봤을 때 한 번 나올 법한 패턴'이다. 즉 레지스터는 '이 버킷에서 가장 드문 사건의 희귀도'를 저장한다.

<!-- empty-paragraph -->

### 2단계. Merge 연산(⊕)

아래와 같이 두 HLL을 합칠 때가 Monoid 연산이다. max는 결합법칙, 교환법칙을 모두 만족하고, 항등원은 레지스터 전체가 0인 HLL이다.

```
merge(A, B)[i] = max(A[i], B[i])   for all i
```

<!-- empty-paragraph -->

### 3단계. 카디널리티 추정

```
E = α_m · m² · (Σ 2^(-register[i]))^(-1)
```

<!-- empty-paragraph -->

## Monoid가 왜 강력한가

```
log_server_1  →  HLL_1
log_server_2  →  HLL_2   →   merge → 전체 HLL → 카디널리티 추정
log_server_3  →  HLL_3
```

각 서버에서 독립적으로 HLL을 만들고, 나중에 merge만 하면 된다. 따라서 원본 데이터를 한 곳에 모을 필요가 없어진다. Monoid의 결합법칙 덕분에 어떤 순서로 merge해도 결과가 같기 때문이다.

Apache Spark, Flink, Redis 등에서 HyperLogLog을 많이 사용하는 이유이다. 실제로 Redis의 PFMERGE 커맨드가 정확히 이 monoid merge 연산으로 이루어져 있다.