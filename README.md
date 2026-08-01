# ex-api

치지직 팔로워 증가량을 일요일 링피트 시간으로 환산해 보여 주는 OBS용 위젯과
예약 시각부터 운동시간을 차감하는 카운트다운 위젯, 위젯 링크 편집기입니다.

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

편집기는 버튼만 눌러서 링크를 만들도록 되어 있습니다. 위젯 종류, 테마
(`흰색` = 종이, `투명` = 유리), 운동 시작 시각만 전면에 있고 문구·크기·계산
설정은 접혀 있습니다. 고른 값은 미리보기와 OBS 링크에 즉시 반영됩니다.

`운동 타이머`를 고르면 시작 운동시간을 팔로워 적립량으로 자동 산정하거나
원하는 분으로 직접 정할 수 있습니다. 한국시간 시작 시각은 `오늘 / 내일 /
이번 주 일요일` 칩과 `±10분 / ±1시간` 버튼으로 지정합니다. 직접 시간을 고르면
바로 아래에서 팔로워 시간 연장 여부도 함께 정합니다. 연장을 켜면 진행 중 새
팔로워마다 기본 30초가 더해집니다. 기본 시작 시각은 다음 일요일 14:00이고,
`session`은 시작 시각에서 `ringfit-YYYYMMDD-HHmm` 형태로 자동 생성됩니다.

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
| `mode` | `accrual` | `countdown`이면 예약 시각부터 운동시간 차감 |
| `startAt` | 없음 | 카운트다운 시작 Unix timestamp(초 또는 밀리초) |
| `session` | `default` | 최고 팔로워와 종료 상태를 구분하는 게임 이름 |
| `durationSource` | `followers` | 시작 운동시간 산정 방식 (`followers` 또는 `manual`) |
| `manualMinutes` | `90` | 직접 설정한 시작 운동시간(분, 1~1440) |
| `followerExtension` | `1` | 진행 중 팔로워 시간 연장 (`1` 켜기, `0` 끄기) |
| `followerLabel` | `지금 팔로워` | 왼쪽 상단 문구 |
| `baselineText` | `기준 {initial}명부터` | 왼쪽 하단 문구 (`{initial}` 치환) |
| `actionText` | `팔로우 눌러서 일요일 링피트` | 중앙 행동 문구 |
| `resultLabel` | `적립`/`운동` | 적립 위젯/운동 타이머의 결과 앞 문구 |
| `eventLabel` | `방금 추가` | 신규 팔로워 이벤트 문구 |
| `endLabel` | `이대로면` | 카운트다운 예상 종료시각 앞 문구 |
| `startPreviewText` | `준비중 >> 링피트` | T-60부터 표시하는 시작 예고 문구 |
| `startText` | `링피트 시작!!` | 0초부터 배경과 함께 3초 동안 유지하는 시작 문구 |
| `lastChanceText` | `끝난줄?` | 남은 5초 이하에서 시간이 추가될 때 표시하는 문구 |
| `endedText` | `!!! 링피트 완주 !!!` | 운동 타이머가 최종 종료된 뒤 가운데 문구 |

위치별 글자 크기는 `followerLabelSize`, `followerCountSize`, `baselineSize`,
`actionSize`, `totalSize`, `eventLabelSize`, `eventValueSize`로 조절할 수 있습니다.
직접 파라미터를 입력하지 않아도 편집기가 안전한 범위의 링크를 만들어 줍니다.

기본 OBS 브라우저 소스 권장 크기는 `650 × 100`입니다. 크기를 바꿀 때는 URL의
`width`, `height`와 OBS 브라우저 소스의 가로·세로 값을 동일하게 맞춥니다.

```text
https://11qaws.github.io/ex-api/?width=1600&height=140&fontSize=72
```

운동 타이머는 다음 식으로 매초 다시 계산하므로 OBS 비활성화나 새로고침 뒤에도
실제 시각과 맞습니다.

```text
시작 운동시간 = 팔로워 적립량 또는 manualMinutes
추가 운동시간 = followerExtension이 켜진 뒤 늘어난 팔로워 × 1명당 운동시간
예상 종료시각 = startAt + 시작 운동시간 + 추가 운동시간
남은시간 = max(예상 종료시각 - 현재시각, 0)
```

## 배포

배포 순서와 비밀키 설정은 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)를 참고하세요.

Worker는 별도 키 없이 치지직 공개 채널 응답을 사용할 수 있습니다. 치지직 개발자
센터의 `Client ID`, `Client Secret`을 등록하면 같은 주소에서 공식 Open API를
자동으로 우선 사용합니다.
