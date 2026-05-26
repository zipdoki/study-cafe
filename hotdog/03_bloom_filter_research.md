# Monoid

모노이드는 대수학에서 나온 개념인데, 프로그래밍에서도 자주 쓰인다. 아주 간단한 규칙 3가지만 지키면 된다.

<!-- empty-paragraph -->

## 모노이드의 조건

어떤 집합 + 연산이 있을 때, 아래 세 가지를 만족하면 모노이드이다.

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

## 모노이드가 가능하게 하는 것

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

로그 1억 건에서 고유 유저 수를 세고 싶다. 이를 정확히 세려면 모든 ID를 Set에 넣는 것을 생각할 수 있는데, 문제는 이 때 메모리를 엄청나게 사용해야 한다는 것이다.

HyperLogLog의 아이디어는 정확도를 조금 포기하고, 아주 적은 메모리(몇 KB)로 오차 ~1% 이내로 추정하는 것이다.

<!-- empty-paragraph -->

![](https://raw.githubusercontent.com/zipdoki/study-cafe/pages/images/1779821776963.png)

<!-- empty-paragraph -->