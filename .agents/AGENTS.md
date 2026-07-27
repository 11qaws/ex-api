# ex-api 개발 지침

- GitHub Pages에 배포되는 정적 위젯과 Cloudflare Worker API를 한 저장소에서 관리한다.
- 브라우저 코드에 치지직 `Client-Secret`을 포함하지 않는다.
- OBS 브라우저 소스에서 잘 보이도록 투명 배경과 1280×100 기준 레이아웃을 유지한다.
- UI는 `rettohighlight`의 `uf-row` 시각 언어(왼쪽 정체성 레일, 평평한 텍스트 면, 오른쪽 초상 bleed)를 따른다.
- 기본 채널 ID는 유레카 채널이며, 기준 팔로워는 1,031명, 팔로워 1명당 0.5분이다.
- 계산과 API 입력 검증에는 자동 테스트를 추가한다.
- 커밋 전 `npm test`, `npm run lint`, `npm run build`를 실행한다.

