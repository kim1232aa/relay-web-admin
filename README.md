# relay-web-admin

本机中继控制台：Clash → Cloudflare 隧道 → xray（VLESS+WS）→ **Tor / OpenVPN 多出口**。

从 [cloudshell-web-admin](https://github.com/kim1232aa/cloudshell-web-admin) 改造，去掉 gcloud / Cloud Shell。多出口对齐 [kui-local-multi-exit](https://github.com/kim1232aa/kui-local-multi-exit) 的槽位思路，但不跑 Docker。

## 数据路径

```
Clash / v2rayN
  → Cloudflare（优选 IP，SNI = 隧道主机名）
  → cloudflared
  → mux（/vless 进本机，/res-* 进对应电路）
  → xray VLESS+WS
  → 本机公网  或  Tor SOCKS  或  OpenVPN(netns+TUN)
```

- **⚡ CF入口** `/vless`：出口是这台机器
- **🧅 Tor** `/res-{jp,us,de,...}`：每国一条 Tor 电路，订阅只发已通的
- **🔑 OpenVPN** `/res-ovpn-*`：宿主禁 TUN 时在独立 netns 里拨 VPNGate TCP/443

订阅里的节点名带真实出口 IP。没拨通的国家不会出现。

## 订阅

隧道域名绑好后：

- Clash：`https://<host>/sub-7e4c91ab2d08f3c6`
- v2ray：`https://<host>/sub-7e4c91ab2d08f3c6/links`
- sing-box：`https://<host>/sub-7e4c91ab2d08f3c6/sb.json`

## 启动

```bash
npm install
# 把 xray / cloudflared / openvpn / tor / slirp4netns 放到 proxy-bin/ 与 proxy-bin/native/
echo 'eyJ...' > proxy-bin/cf-tunnel-token   # Cloudflare Tunnel token
echo 'vless.example.com' > proxy-bin/cf-hostname
bash proxy-bin/start.sh
bash proxy-bin/supervise.sh &
npm run dev
```

Cloudflare 隧道 Public Hostname 指到本机 `http://127.0.0.1:38079`。

**不要把 `proxy-bin/cf-tunnel-token` 提交进 git。**
