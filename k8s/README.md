# Running on Kubernetes

Examples, not a chart: read them and change the names to yours.

| File | What it is |
|---|---|
| `deployment.yaml` | The Deployment and Service. Expects ZeroClaw's gateway at `zeroclaw.zeroclaw.svc.cluster.local:42617`; change `ZEROCLAW_UPSTREAM` if yours is elsewhere |
| `httproute.yaml` | Gateway API routes for `chat.example.com`, an HTTP to HTTPS redirect, and the long timeouts the chat needs (Envoy Gateway) |

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/httproute.yaml     # after changing the hostname and the Gateway
kubectl -n zeroclaw rollout status deploy/zeroclaw-ui
```

The pod has no Secret and no volume. It is unprivileged, with a read-only root filesystem.

## What the proxy in front must allow

- **WebSockets** on `/ws/`.
- **Long requests**: a turn can run for minutes. Idle timeout of an hour, no request timeout.
- **HTTPS**. The page sends the pairing token on every request.
- Uploads up to 25 MB (images).

## Pairing a browser

```bash
kubectl -n zeroclaw exec deploy/zeroclaw -- zeroclaw gateway get-paircode --new
```

Enter the code on the page. Paired browsers are listed and removed on the Settings page.

## If something is wrong

```bash
kubectl -n zeroclaw logs deploy/zeroclaw-ui -f
```

If the page loads but every request fails, ZeroClaw is down or `ZEROCLAW_UPSTREAM` is wrong,
not this pod.
