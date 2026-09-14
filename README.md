# Function-Native Graphics Playground

**Graphic = f(x, y)**

그래픽 전체를 정규화된 좌표 `(x, y)`를 받아 스칼라 값을 반환하는 하나의 함수로 표현하는 브라우저 전용 플레이그라운드입니다. 내부는 음수, 경계는 0, 외부는 양수입니다. React + TypeScript + Vite + CodeMirror 6로 구성하며, 백엔드나 외부 API 없이 실행됩니다.

## 실행

Node.js 22.12 이상 또는 24 LTS를 권장합니다.

```sh
npm ci
npm run dev
```

터미널에 표시된 로컬 주소를 엽니다. 기본 주소는 `http://127.0.0.1:5173`입니다.

```sh
npm run build
npm run preview
```

`dist/`는 정적 배포 산출물입니다. 정적 호스팅에서 제공할 수 있으며, 실행 중 네트워크 API·폰트·CDN 요청은 필요하지 않습니다. `file://`로 HTML을 직접 여는 대신 정적 웹 호스팅 또는 Vite 미리보기를 사용합니다.

## 30초 시연

1. 첫 화면의 초승달은 두 원의 거리 방정식을 `max(a, -b)`로 합성하고 픽셀마다 평가한 결과입니다.
2. Clear → Circle 도구로 원 두 개를 그립니다. 원은 **중심에서 가장자리로** 드래그합니다.
3. **Convert to Function →**: 두 원의 거리식이 하나의 `f(x, y) = min(...)` 수식으로 바뀝니다.
4. **← Render Function**: 함수를 샘플링하여 캔버스에 표시합니다.
5. `min(a, b)`를 `max(a, b)`, 다시 `max(a, -b)`로 바꾸고 각각 Render를 누릅니다.
6. Wave field 또는 Math pattern 예제를 불러온 뒤 Render를 누릅니다. 객체 없이도 식 하나로 공간 전체를 정의할 수 있습니다.

예제 클릭, 코드 입력, 파일 불러오기는 렌더링을 실행하지 않습니다. 최초의 기본 초승달만 자동 렌더링합니다. 저장된 코드가 있으면 편집기에 복원하고 직접 Render하도록 표시합니다.

## 수식으로 표현하기

일변수 함수는 `f(x) = ...`로 입력하고 **Render Function**을 누르면 `y = f(x)` 곡선으로 표시됩니다. **Function graph** 예제에서도 시작할 수 있습니다.

```text
f(x) = x
// 또는 f(x) = x^2
// 또는 f(x) = 0.5 + 0.2 * sin(2 * PI * x)
```

좌표 범위는 기존 캔버스와 같은 0~1이며 y는 아래로 증가합니다. 곡선의 세로 두께는 0.012 좌표 단위입니다. 중간 변수도 지원하지만 식과 중간 정의에서 y를 사용할 수는 없습니다. 저장하거나 다시 열 때 `f(x)` 입력을 유지하며, **ƒ=**를 누르면 `abs(y - (...)) - 0.006` 형태의 `f(x, y)` 필드로 전개되어 그리기와 합성할 수 있습니다.

화면과 파일의 기본 표현은 도형 이름을 사용하지 않는 **실제 수학식**입니다. 예를 들어 원은 다음과 같습니다.

```text
f(x, y) = sqrt((x - 0.5)^2 + (y - 0.5)^2) - 0.2
```

사각형은 다음과 같습니다. `qx`, `qy`는 각 좌표에서 한 번 계산되는 중간값이며, 별도의 그래픽 객체가 아닙니다.

```text
qx = abs(x - 0.5) - 0.2;
qy = abs(y - 0.5) - 0.1;
f(x, y) =
  sqrt(max(qx, 0)^2 + max(qy, 0)^2)
  + min(max(qx, qy), 0)
```

- 원: 중심으로부터의 거리 − 반지름.
- 사각형: `abs`, `sqrt`, `min`, `max`로 표현한 표준 box SDF.
- 선: 선분에 투영한 위치를 `min(1, max(0, t))`로 제한한 뒤 점과 투영점 사이의 거리 − 두께/2.
- 자유곡선: 각 선분 거리의 `min`. 반복되는 계산에는 `t1`, `d2` 등의 중간 변수를 사용합니다.
- 합집합 / 교집합 / 차집합: `min(a,b)` / `max(a,b)` / `max(a,-b)`.
- 이동 / 확대 / 회전: 뺄셈 / 나눗셈 / sin·cos로 입력 좌표를 역변환합니다.
- 반복 / 대칭 / 부드러운 합집합: `floor` / `abs` / 다항식으로 전개됩니다.

중간 정의는 세미콜론으로 끝냅니다. 앞에서 정의한 변수만 사용할 수 있고, 같은 이름을 다시 정의하거나 `x`, `y`, `PI`, `E`, 수학 함수 이름을 덮어쓸 수 없습니다. 순환 참조·속성 접근·임의 JavaScript 실행은 허용하지 않습니다. 마지막 식은 `f(x) = ...` 또는 `f(x, y) = ...`입니다.

기존 도형 문법은 입력 편의를 위해 계속 지원합니다. 편집기 상단의 **ƒ= (Expand to equation)** 버튼은 모든 도형과 연산을 수식으로 전개합니다. 이 버튼은 렌더링을 실행하지 않습니다. 기본 예제와 그리기 변환도 같은 수식 전개기를 사용합니다. 예전에 저장된 단축 문법은 처음 열 때 수식으로 변환하며, 잘못된 기존 코드는 수정할 수 있도록 그대로 보존합니다.

## 호환되는 단축 문법

```text
circle(cx, cy, radius)
box(cx, cy, width, height)
line(x1, y1, x2, y2, thickness)
polyline(points([x, y], [x, y], ...), thickness)

union(a, b, ...)
intersect(a, b, ...)
subtract(a, b)
smoothUnion(a, b, k)

translate(dx, dy, shape)
scale(factor, shape)
rotate(radians, shape)
repeat(spacingX, spacingY, shape)
repeat(spacing(spacingX, spacingY), shape)
mirrorX(shape)
mirrorY(shape)

field(sqrt((x - 0.5)^2 + (y - 0.5)^2) - 0.2)
```

- `x`, `y`, `PI`, `E`와 `+ - * / ^`, 괄호를 지원합니다. `^`는 거듭제곱이며 오른쪽부터 결합합니다. `-2^2`는 `-4`입니다.
- 수학 함수: `sin cos tan sqrt abs pow min max floor ceil`.
- 숫자는 소수·지수 표기와 상수식(`PI / 4`)을 지원합니다. `//` 주석도 허용합니다.
- 원 반지름, 크기, 두께, scale 배율, 반복 간격, smoothUnion의 k는 양수여야 합니다.
- scale·rotate의 기준점은 **원점 (0, 0)**입니다. 회전 단위는 라디안이며 y가 아래로 증가하므로 양의 각도는 화면에서 시계 방향입니다.
- 중앙 기준 회전: `translate(.5, .5, rotate(PI/4, box(0, 0, .4, .2)))`.
- repeat는 `(0.5, 0.5)`를 중심으로 좌표를 셀 안에 접어 넣습니다. 매끄러운 반복을 위해 도형이 해당 셀 안에 들어오도록 만드세요.
- mirrorX는 오른쪽 절반을 `x=.5` 기준으로, mirrorY는 아래쪽 절반을 `y=.5` 기준으로 복제합니다.
- Boolean 합성과 임의의 수학식은 모든 위치에서 정확한 유클리드 거리를 보장하지는 않습니다. 부호로 내부·외부를 정의하는 scalar field로 취급합니다.

## 편집과 파일

- Select / Pen / Line / Circle / Rectangle / Eraser. 도구 단축키는 V / P / L / C / R / E.
- Select로 아직 렌더링하지 않은 요소를 이동하고 Delete로 삭제합니다.
- Eraser는 polyline 필드를 **subtract**합니다. 자유곡선은 변환 시 Ramer–Douglas–Peucker 알고리즘으로 단순화합니다.
- Render는 하나의 함수 결과를 확정합니다. 이전 요소를 편집하려면 Undo로 돌아갑니다. 확정된 필드 위에도 새 요소를 추가할 수 있습니다.
- 그리기 Undo / Redo: Ctrl 또는 Cmd + Z / Shift + Z. Clear도 되돌릴 수 있습니다. 최대 30개 이전 상태를 유지합니다.
- 편집기 내 Undo / Redo는 CodeMirror가 처리합니다. Ctrl 또는 Cmd + Enter는 Render입니다.
- Copy Function, Save Function (`.fg` 일반 텍스트), `.fg` / `.txt` Import를 지원합니다.
- Export PNG는 현재 확정된 래스터를 내보냅니다. 미리보기 요소가 있으면 먼저 Convert → Render해야 합니다. 아직 렌더링하지 않은 코드 변경은 PNG에 포함되지 않습니다.
- Grid는 편집 보조선이며 PNG에 포함되지 않습니다. Show field는 다음 Render에서 회색조 등고선으로 표시합니다.
- 마지막 코드는 localStorage에 저장됩니다. 저장소 사용이 차단되어도 편집과 렌더링은 동작합니다.

## 구현

```text
src/field/types.ts        FieldNode / 안전한 수식 AST
src/field/parser.ts       토큰화, 우선순위 파싱, 타입·인자 검증
src/field/expressions.ts  허용된 수학 연산의 클로저 평가
src/field/evaluate.ts     SDF, Boolean 합성, 역좌표 변환
src/field/serializer.ts   하나의 읽기 쉬운 필드 표현식 생성
src/field/equation.ts     모든 도형·연산을 산술식과 중간 정의로 전개
src/drawing/drawing.ts    임시 편집 모델, RDP, 필드 변환
src/render/rasterize.ts   evaluate(node, x, y) → 픽셀 버퍼
src/components/          Canvas 미리보기, CodeMirror, Reference
src/App.tsx              명시적 변환, 이력, 파일, 저장 상태
```

최종 렌더러는 각 픽셀의 정규화 좌표에서 `evaluate(node, x, y)`를 호출합니다. 결과를 흑백/회색조의 불투명 RGBA 버퍼에 기록하고 `putImageData`로 표시합니다. RGBA는 브라우저 픽셀 버퍼 형식일 뿐이며 그래픽 색상 모델이나 색상 조절 기능은 없습니다.

`ctx.arc`, `ctx.rect`, `ctx.lineTo`는 최종 렌더러에 없습니다. SVG 요소는 드래그 중인 입력과 미확정 요소를 보여주는 **편집용 미리보기 및 UI 아이콘에만** 사용합니다. 저장·합성·최종 렌더링의 본질은 FieldNode 함수입니다.

JavaScript 코드를 실행하는 `eval`이나 `new Function`은 사용하지 않습니다. 파서는 허용된 수학식과 한 번만 정의하는 중간값만 받아들이며 속성 접근, 임의 호출, 문자열, 객체 문법을 거부합니다. 단축 문법은 60,000자 / 토큰 12,000개 / 파싱 노드 4,000개, 전개된 수식은 1,000,000자 / 토큰 250,000개 / 파싱 노드 100,000개 / 중간 변수 4,096개로 제한합니다. 공통 파싱 재귀 깊이는 80입니다. 파일 가져오기는 1 MB까지 허용합니다. 각 제한은 함께 적용됩니다.

렌더 해상도는 256² / 512² / 768²입니다. 8개 행마다 실행을 양보해 진행률·취소 조작을 허용합니다. 15초 한도를 초과하거나 NaN/Infinity가 발생하면 실패합니다. 파싱과 전체 평가가 모두 성공했을 때만 새 캔버스로 교체하므로 오류와 취소는 이전 결과를 훼손하지 않습니다.

## 검증

```sh
npm test
npm run test:e2e
npm run build
```

E2E 테스트는 로컬 Google Chrome을 사용하며 Vite 개발 서버를 자동 시작합니다. Chrome이 없는 환경에서는 Playwright 브라우저를 설치하고 `playwright.config.ts`의 `channel: 'chrome'` 설정을 환경에 맞게 변경하세요.

- 단위 테스트: SDF, segment/polyline 거리, Boolean 연산, transform, repeat, mirror, smoothUnion, 안전한 파서, 수학식, serializer AST/평가 왕복, RDP 허용 오차, 빈 그림·지우개, 픽셀 버퍼, 취소·비정상 값.
- 브라우저 테스트: 그리기→함수→렌더, union→intersect→subtract, wave, 자유곡선, transform, 에러 보존, PNG 파일 헤더, 파일 Import/Save/Copy, Undo/Redo·Select 이동·단축키, localStorage, 필드 시각화, 모바일 넘침, 모든 예제와 Reference/About.
- 렌더러 검증 시 Canvas의 `arc`, `rect`, `lineTo`를 강제로 실패하도록 교체한 상태에서도 렌더가 통과하는지 확인합니다.

새 기능이나 수정 사항은 해당 로직과 시나리오에 맞는 테스트로 검증하세요.
