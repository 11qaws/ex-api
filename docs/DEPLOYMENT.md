# 배포 안내

## 1. 치지직 애플리케이션 준비(선택)

치지직 개발자 센터에서 애플리케이션을 만들고 `Client ID`, `Client Secret`을 준비합니다.
브라우저나 GitHub 저장소에는 이 값을 넣지 않습니다.

## 2. Cloudflare Worker 배포

Worker는 별도 키가 없으면 치지직 공개 채널 응답을 사용합니다.

```bash
cd worker
npx wrangler deploy
```

공식 Open API를 우선 사용하려면 배포 전 비밀값을 등록합니다.

```bash
npx wrangler secret put CHZZK_CLIENT_ID
npx wrangler secret put CHZZK_CLIENT_SECRET
```

배포 뒤 다음 주소로 상태를 확인합니다.

```text
https://<worker-address>/health
```

팔로워 API:

```text
GET https://<worker-address>/api/channels/<channelId>/follower-count
```

## 3. GitHub Pages 연결

GitHub 저장소의 `Settings → Secrets and variables → Actions → Variables`에 다음 값을
추가합니다.

```text
VITE_API_BASE_URL=https://<worker-address>
```

그 다음 `Deploy widget to GitHub Pages` 워크플로를 실행합니다. Pages 소스가 GitHub
Actions로 지정되어 있어야 합니다.

최종 OBS URL:

```text
https://11qaws.github.io/ex-api/
```

Worker 배포 전에도 아래 미리보기 URL로 디자인을 확인할 수 있습니다.

```text
https://11qaws.github.io/ex-api/?preview=1033
```
