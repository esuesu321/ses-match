# 本人専用・複数PC運用

コード公開と実データ公開を分離する。コードのライセンスはMIT。
2026-10-13にGitHubのコードを公開。タグ・リリースなし、Actions実行履歴0件を確認。
サーバー契約・実サーバー配置・ChatGPTの実認証はまだ実行していない。

## 構成

自宅／会社のブラウザ → HTTPSプロキシ → loopbackのNode.js → 保護したSQLite。
2台のPCは同じURLへアクセスする。実データはサーバー側の1つのDBに保存する。
Node.jsは127.0.0.1から変更しない。4317番を外部へ開けない。管理用SSHは鍵認証とし、可能な範囲で接続元を制限する。
最初は本人専用。ブラウザ標準のBasic認証をHTTPS上で使用する。
社内利用へ進む前に個別アカウント・権限・監査記録へ移行する。

## 配置前に必要なもの

- 本人が管理する常時稼働サーバー、Node.js 24以上。
- HTTPS証明書を取得できるホスト名とHTTPSリバースプロキシ。
- サーバー・バックアップのアクセス権限、料金の確認。

設定値はサーバーの.envへ入れる。GitHub、ブラウザ用コード、ログへ保存しない。
SES_PUBLIC_ORIGIN=https://実際のホスト名、SES_AUTH_USER、SES_AUTH_PASSWORDを設定する。
パスワードは24文字以上のランダム値とし、パスワード管理ツールで保存する。
SES_DBは所有者だけが読める保存先を指定する。空欄の場合はdata/ses.sqlite。
AI_ENDPOINT、AI_API_KEY、AI_MODELは空欄のままにする。SES_AI_MODE=chatgptを設定し、別料金APIを使用しない。

## ChatGPTの初回接続とサーバー移送

1. 本人PCで`npm ci --ignore-scripts`後に`npm run chatgpt:connect`を実行。
2. 表示された認証URLを同じPCのブラウザで開き、ChatGPTアカウント・ワークスペース・利用枠許可を確認。
3. PCで`npm run chatgpt:verify`を実行。架空の短文で応答完了を確認する。
4. サーバーでSES_CHATGPT_DIRを設定し、`node scripts/chatgpt-connect.mjs prepare-host`を実行する。サーバー専用のhost.jsonを作る。
5. PCのconnection.jsonだけをSSH等の暗号化された経路でサーバーの保護したSES_CHATGPT_DIRへ移送。ローカルのhost.jsonでサーバーのhost.jsonを上書きしない。
6. サーバー上のconnection.jsonを実行ユーザー所有・0600、ディレクトリを0700にする。Windowsはユーザープロファイルのアクセス制御も確認する。
7. サーバーで`npm run chatgpt:verify`を実行し、画面のモデル取得と架空データでのAI照合を確認する。
8. PCとサーバーが同じrefresh_tokenを同時に更新しない。移送後はサーバーだけが接続を管理する。

認証情報をチャット・メール・GitHubへ貼り付けない。コードを公開しただけで実接続成功とは扱わない。
再認証が必要な場合はサーバーを停止してから同じ手順で更新する。
接続解除はChatGPTの設定から連携を解除し、サーバーの保護された認証情報を削除する。

公式根拠：
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference

## Linux配置用の設定見本

deploy/ses-match.serviceは専用ユーザーでNodeを常時実行するsystemdの見本。
deploy/CaddyfileはHTTPSの発行・更新とlocalhostへの転送を行うCaddyの見本。
実機での起動・設定検証は未完了。Nodeの実パス、ホスト名、ファイル権限を配置時に確認する。
コードは/opt/ses-match、保護した環境設定は/etc/ses-match/app.env、実データとChatGPT認証は/var/lib/ses-matchに分離。
保護した設定ファイルにSES_PUBLIC_ORIGIN、SES_AUTH_USER、SES_AUTH_PASSWORD、SES_AI_MODE=chatgptを設定。
Caddy実行環境のSES_DOMAINは、SES_PUBLIC_ORIGINのホスト名と一致させる。
サーバーでは専用ユーザーを作成し、コードを読み取り専用、データ保存先だけ書き込み可能にする。

## リバースプロキシ条件

- TLSを終端して127.0.0.1:4317だけに転送。
- Hostを実際の公開ホスト名に固定。
- X-Forwarded-Protoをhttpsに上書き。外部からの同名ヘッダーを信用しない。
- Authorizationをアプリへ転送し、アクセスログへ記録しない。
- 本文、Cookie、認証情報をログへ記録しない。
- レスポンスをキャッシュしない。
- HTTPSの認証画面へHTTP経由で認証情報を送らない。

## 配置後の受け入れ確認

架空データだけで先に検証する。
未認証で画面・案件・要員・履歴が取得できないこと、別サイトから書き込めないことを確認。
自宅PCで登録 → 会社PCで表示・変更 → 自宅PCで再読込して変更が見えることを確認。
サーバー再起動後もデータが残ることを確認。
バックアップはSQLiteのオンラインバックアップAPIを使うか、停止してWALを含めて整合性を保つ。
バックアップは暗号化し、コード・実行サーバーと別の保護された場所へ保存する。
バックアップから別のテストDBへ復元し、レコードを確認してから実データを移す。

## 現在の制限

ChatGPT契約枠のOAuth接続・Responses呼び出しは実装済み、実アカウントでは未検証。
コードを公開しただけで、AIマッチングが使えるとは扱わない。
ブラウザ標準認証は明示的ログアウトのUXに制約があるため、共有PCでは使用しない。
本変更は絶対的な安全性を保証しない。実配置のTLS・権限・更新・バックアップ確認が必要。

## サーバー側での更新（2026-10-13追加）
開発側で `node scripts/build-release.mjs /tmp/ses-match-release.tar.gz` を実行し、コードだけのリリースを作ります。データ・認証情報・環境設定・添付ファイルは梱包しません。信頼するGitHubコミットから作成したファイルをSSHでサーバーに送ります。manifestのハッシュは転送時の破損検出用であり、発行者の認証ではありません。

初期配置完了後、サーバーで `sudo bash /opt/ses-match/deploy/update.sh /安全な保存先/ses-match-release.tar.gz` を実行します。必要なコマンドはNode.js 24以上（/usr/bin/node）、npm、Python3、tar、flock、runuser、systemctl。実行ユーザーses-match、既存service、/etc/ses-match/app.envと/var/lib/ses-matchをあらかじめ配置する必要があります。このスクリプト単独では新規サーバーを構築しません。

処理はアーカイブのパス・リンク・サイズ・ファイル一覧・ハッシュ検証→専用ユーザーで依存導入とテスト→SQLiteの整合したスナップショットをAES-256-GCM暗号化→プログラム差替え→起動→本人認証でのAPI取得成功と未認証拒否の検査。失敗時は旧プログラムへ戻します。DBは自動で旧版へ戻しません。将来DBスキーマを変更する更新は、別途移行・復元手順を作ってから行います。

暗号化ファイルは/var/backups/ses-match、32バイトの復号鍵は/etc/ses-match/backup.key（0600）。これは更新前の同一サーバー内の退避です。災害・サーバー消失に備える外部バックアップとは別です。ファイルと復号鍵を別々の保護された外部保存先にも保管する運用は未構築です。鍵を失うと復元できません。旧プログラムとバックアップの自動削除はしません。

検証状況：自動テスト62件、構文確認通過。暗号化・改ざん検出・WALを含むDB復元照合・機密なしの梱包をテスト済み。更新スクリプトのsystemd操作、TLS、実サーバーでの差替えと自動復帰は未検証です。既存のAPIテストでは2つのクライアントが同じDBを参照することを確認していますが、実際の2台のPCによる接続確認は未実施です。

訂正：ユーザーPCでのChatGPT接続・モデル呼び出しは確認済みです。上記の古い「実アカウント未検証」はサーバー移送後の検証については引き続き該当します。

## 契約前の検証と方針（2026-10-13）
サーバー契約は最後。未契約のまま開発・検証・配置準備を進め、ユーザーに契約状況の確認や新版ZIPの確認を繰り返し依頼しない。実機が必要なTLS発行・DNS・外部ネットワーク・ChatGPT認証移送後の確認だけを契約後に行う。

- 自動テスト74件通過。更新フローを一時ディレクトリで実行し、正常更新、起動失敗、ヘルスチェック失敗、事前テスト失敗、不正アーカイブ・秘密ファイル混入・リンク・パス逸脱・ハッシュ不一致を検証。systemctl・ユーザー切替・所有権変更はテスト用の代替コマンドを使用した。実systemdとネットワークの検証はこれから。
- `/api/health` は本人認証で保護し、DB接続の確認結果だけを返す。動作確認のために案件・要員を読み出さない。check-serverは正常なJSON応答と未認証拒否を確認し、設定エラーでも秘密の値を出力しない。
- `node scripts/restore-backup.mjs BACKUP KEYFILE NEW_DATABASE` は既存ファイルへ上書きせず、新しいDBだけに復元する。暗号認証・SQLite整合性・records表を検証し、誤った鍵・破損・既存の出力先は拒否する。本番DBの切替は停止・退避・所有権設定・再確認の別作業。
- `node scripts/prepare-server.mjs 実際のホスト名 新しい保護ディレクトリ` でapp.env・backup.key・caddy.envを作成できる。既存ディレクトリの上書きを拒否し、ランダムパスワードと独立した32バイトの暗号鍵を生成する。秘密は画面へ出さない。配置時のみ使用し、生成したファイルはSSHで移送する。GitHubやチャットに添付しない。
- 更新スクリプトは `SES_DEPLOY_ROOT` で別のディレクトリ構成を指定できる。通常は空欄のまま。検証では一時ディレクトリを指定し、実際の/etcや/optへ触れない。`SES_DEPLOY_NODE` はNodeの絶対パスを変更する場合に使う。テスト用環境変数を本番へコピーしない。
- 梱包対象を拡張子と既知のコードディレクトリに限定。ソースの下に認証JSON・添付PDF・DB・環境設定が混入した場合も拒否する。
