# ex-api

치지직 팔로워 증가량을 일요일 링피트 시간으로 환산해 보여 주는 OBS용 위젯과
위젯 링크 편집기입니다.

- 위젯: <https://11qaws.github.io/ex-api/>
- 편집기: <https://11qaws.github.io/ex-api/editor/>

기본 계산식은 다음과 같습니다.

```text
max(현재 팔로워 - 1031, 0) × 0.5분
```

## 구성

- `src/`: GitHub Pages에 배포되는 650×100 방송 위젯과 편집기
- `editor/`: 문구·크기·링크 생성 편집기 진입 페이지
- `worker/`: 치지직 응답을 CORS 안전하게 중계하는 Cloudflare Worker
- `tests/`: 계산식과 API 응답 검증

외곽 폼과 왼쪽 정체성 띠를 다른 위젯에서 재사용하려면
[위젯 폼 명세](docs/WIDGET_FORM_SPEC.md)를 참고하세요.

## 로컬 실행

```bash
npm install
npm run dev
```

API 없이 디자인을 확인할 때:

```text
http://localhost:5173/ex-api/?preview=1033
```

편집기:

```text
http://localhost:5173/ex-api/editor/
```

편집기에서 기본 종이 테마와 방송 화면이 비치는 유리 테마를 선택할 수 있으며,
선택한 테마는 미리보기와 생성되는 OBS 링크에 즉시 반영됩니다.

## 위젯 URL 옵션

| 파라미터 | 기본값 | 설명 |
| --- | ---: | --- |
| `channelId` | 유레카 채널 ID | 조회할 치지직 채널 |
| `initial` | `1031` | 내기 시작 팔로워 수 |
| `minutesPerFollower` | `0.5` | 팔로워 1명당 링피트 분 |
| `refresh` | `30` | 새로고침 주기(10~300초) |
| `api` | 빌드 환경변수 | Worker 주소 |
| `preview` | 없음 | API 대신 지정 팔로워 수로 미리보기 |
| `eventDelta` | `0` | 미리보기에서 새 팔로워 이벤트를 강제로 표시할 인원 |
| `width` | `650` | 위젯 가로 크기(px, 480~3840) |
| `height` | `100` | 위젯 세로 크기(px, 64~1080) |
| `fontSize` | `48` | 중앙 결과 문장의 기준 글자 크기(px, 24~120) |
| `theme` | `glass` | 위젯 테마 (`glass` 또는 `paper`) |
| `followerLabel` | `지금 팔로워` | 왼쪽 상단 문구 |
| `baselineText` | `기준 {initial}명부터` | 왼쪽 하단 문구 (`{initial}` 치환) |
| `actionText` | `팔로우 눌러서 일요일 링피트` | 중앙 행동 문구 |
| `resultLabel` | `적립` | 총 적립 시간 앞 문구 |
| `eventLabel` | `방금 추가` | 신규 팔로워 이벤트 문구 |

위치별 글자 크기는 `followerLabelSize`, `followerCountSize`, `baselineSize`,
`actionSize`, `totalSize`, `eventLabelSize`, `eventValueSize`로 조절할 수 있습니다.
직접 파라미터를 입력하지 않아도 편집기가 안전한 범위의 링크를 만들어 줍니다.

기본 OBS 브라우저 소스 권장 크기는 `650 × 100`입니다. 크기를 바꿀 때는 URL의
`width`, `height`와 OBS 브라우저 소스의 가로·세로 값을 동일하게 맞춥니다.

```text
https://11qaws.github.io/ex-api/?width=1600&height=140&fontSize=72
```

## 배포

배포 순서와 비밀키 설정은 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)를 참고하세요.

Worker는 별도 키 없이 치지직 공개 채널 응답을 사용할 수 있습니다. 치지직 개발자
센터의 `Client ID`, `Client Secret`을 등록하면 같은 주소에서 공식 Open API를
자동으로 우선 사용합니다.
