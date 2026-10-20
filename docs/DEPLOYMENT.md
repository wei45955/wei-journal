# Deployment

Wei Journal is deployed with Docker Compose. Two services, one named volume for the data, an optional third for PostgreSQL.

```
backend    the Go API          internal port 8080, never published to the host
frontend   nginx + the SPA     host port WJ_HTTP_PORT, default 8088
postgres   optional            only with the profile "postgres"
```

## Requirements

- Docker 24 or newer with the Compose plugin.
- Enough disk for the database and the uploaded files.
- For HTTPS, a reverse proxy or a TLS terminating load balancer in front of the frontend.

No Go or Node toolchain is needed on the host. The images build everything.

## The quick path

```bash
git clone <the repository> wei-journal
cd wei-journal
cp .env.example .env
$EDITOR .env            # set the administrator password at least
docker compose up -d --build
docker compose logs -f backend
```

The interface is then on `http://<host>:8088`. The API is reachable at `http://<host>:8088/api/...` through the frontend, and on no other port.

The settings come with the clone, in `config.env`. The `.env` file is only needed for the secrets and for the values of the machine; the administrator can also be created through the interface instead, see below.

## The configuration

Everything is read from the environment, in two files.

| File | Committed | Holds |
| --- | --- | --- |
| `config.env` | yes | The settings of the installation: the session lifetimes, the limits, the model names, the logging, the registration switch. It holds no secret, so it travels with the code and the installation behaves the same on every machine. |
| `.env` | no | The secrets and the values of this machine: the administrator password, the model key, the database password, the host port. It is ignored by git. |

A value in `.env` overrides the same value in `config.env`, so the shared behaviour lives in the committed file and the differences between the machines live in the local one. `.env.example` is the template of the second file.

The Compose file reads the two files into the backend, in that order. It also sets a few values itself, which win over both: the paths inside the container (`/data`), the listening address and the build version, which has to match the tag of the image.

The variables that matter in production:

| Variable | Where | Why it matters |
| --- | --- | --- |
| `WJ_ADMIN_PASSWORD` | `.env` | The password of the first administrator. At least 10 characters, or the process refuses to start. |
| `WJ_COOKIE_SECURE=true` | either | Required behind HTTPS. Without it the session cookie travels without the `Secure` flag. |
| `WJ_TRUSTED_ORIGINS` | either | The origins that may call the API with credentials. Only needed when the interface is served from a different origin than the API. |
| `WJ_ALLOW_REGISTRATION=false` | either | Close the registration once the accounts exist. |
| `WJ_VERSION` | the Compose file | The build version. **Not** `dev` in production, see below. |
| `OPENAI_API_KEY` | `.env` | Only if the AI features are wanted. |
| `WJ_HTTP_PORT` | `.env` | The host port of the interface. Default 8088. |

### Moving to another machine

`git pull` brings the settings along, because they are in the committed `config.env`. Only the secrets have to be entered again, because a password in a git repository is a password in every clone of it, in the history of it, and in every mirror of it. Copy the `.env` of the old machine over by hand if the machine is trusted to hold the key, and delete it from the old one afterwards.

The volume with the data does not travel with the repository either. See the backup document for the procedure.

### `WJ_VERSION` decides the debug mode

The web framework switches itself into its debug mode when the running version is `dev`, and the log level follows the same rule. The running version is the **build stamp** of the binary, which is the exact release the image was built from; `WJ_VERSION` only fills in for a binary that was not stamped, such as a local `go run`. The Compose file therefore defaults `WJ_VERSION` to `1.0.0`, and the value is used both as the build stamp and as the runtime variable, so the health endpoint and the running mode always agree.

A container started with `WJ_VERSION=dev` prints the whole route table to the log on every start and logs at the debug level. That is fine for a development machine and wrong for a public installation. An image that was built for a release is never in the debug mode, whatever the environment says, because the build stamp wins.

The full list with all the optional variables is in `config.env`, in `.env.example` and in the architecture document.

## The first administrator

There are two ways, and only one of them can be used per installation.

**Through the environment.** Set `WJ_ADMIN_USERNAME`, `WJ_ADMIN_PASSWORD` and optionally `WJ_ADMIN_EMAIL` in `.env`, then start the stack. The administrator is created **only when the users table is empty**. On every later start the variables are ignored, so rotating the password in `.env` does not change the password of an existing account.

**Through the interface.** Leave the three variables empty and open the interface. The first account that registers becomes the administrator. There is no other way to obtain the admin role: no endpoint takes a role or a user id from the request, so the role cannot be granted or escalated over the API.

After the administrator exists, set `WJ_ALLOW_REGISTRATION=false` and restart.

To change the password of an existing account, sign in and use the change password endpoint. It revokes every other session of that account.

## The volumes

| Volume | Holds |
| --- | --- |
| `journal-data` | `/data/journal.db`, `/data/uploads`, `/data/derived`. |
| `journal-postgres` | The PostgreSQL data directory. Only with the postgres profile. |

The data is on a named volume, not inside the container, so `docker compose down` and a container replacement keep the journal. `docker compose down -v` **deletes the data**. See the backup document before using that.

The database and the uploads directory are never published to the host and never reachable over the network.

### Using a directory on the host instead of the volume

A bind mount is a legitimate choice, for example to put the data on a second disk. It needs one thing the named volume does not: the ownership. The container runs as the unprivileged user `journal` with the uid 10001, and it has to be able to create the database file and the upload directories.

```yaml
services:
  backend:
    volumes:
      - /srv/journal-data:/data
```

```bash
sudo mkdir -p /srv/journal-data
sudo chown -R 10001:10001 /srv/journal-data
docker compose up -d
```

Without the `chown` the backend stops with `open sqlite: unable to open database file: out of memory (14)`, which reads like a memory problem but means the directory could not be written to. The troubleshooting document has the details.

## Behind a reverse proxy

Put your own proxy in front of the frontend container, which listens on `WJ_HTTP_PORT`.

```nginx
server {
    server_name journal.example.com;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 512m;
        proxy_read_timeout 300s;
    }
}
```

Set `WJ_COOKIE_SECURE=true` and `WJ_TRUSTED_ORIGINS=https://journal.example.com`.

### `WJ_TRUSTED_PROXY` and the client address

The client address decides the rate limiter buckets and the sign-in limiter key, so it has to be the address of the person using the journal and not the address of the proxy in front of it.

Gin trusts **every** proxy until it is told otherwise, so the server says what it believes explicitly:

| Setting | Who is believed |
| --- | --- |
| neither set | Nobody. A direct connection reports the real peer address. |
| `WJ_TRUSTED_PROXY=true` | The loopback interface and the private bridge a container network uses (`127.0.0.1/32`, `::1/128`, `172.16.0.0/12`). This is the nginx container of the Compose deployment. |
| `WJ_TRUSTED_PROXY_CIDRS=10.0.0.4/32,192.168.1.1` | Exactly the listed addresses and ranges. The list replaces the set above. |

The Compose file sets `WJ_TRUSTED_PROXY=true`, which is correct there: the backend port is not published, so the only peer that can reach the server is the frontend container, and the forwarding header it sets comes from nginx.

If the reverse proxy runs on another machine, put its address in `WJ_TRUSTED_PROXY_CIDRS` instead. Anything that is not in the list has its forwarding header ignored, so a client that reaches the server directly cannot pretend to be somebody else.

`SetTrustedProxies(nil)` in Gin v1.12.0 *disables* the forwarding header handling rather than enabling it. `prepareTrustedCIDRs` returns `nil` for a `nil` list and `isTrustedProxy` then always answers false. The behaviour above is covered by `backend/cmd/server/main_test.go`.


## PostgreSQL instead of SQLite

SQLite is the default and needs no service. To use PostgreSQL:

```bash
docker compose --profile postgres up -d
```

and in `.env`:

```
WJ_DATABASE_URL=postgres://journal:change-me@postgres:5432/journal?sslmode=disable
POSTGRES_USER=journal
POSTGRES_PASSWORD=change-me
POSTGRES_DB=journal
```

The password is not optional. There is no default for it, so the database refuses to start until one is set, and the URL has to carry the same one.

The migrations run automatically on the first start against the new database, and the same migrations are used for both dialects.

The PostgreSQL container is also not published to the host. To reach it from outside, add a `ports` entry to the service in `docker-compose.yml` and put TLS in front of it, or use an SSH tunnel.

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

The migrations run at start up. Each one is applied in a transaction and recorded in `schema_migrations`, so a restart after a failed upgrade does not apply the same migration twice.

Take a backup first. See the backup document.

## Operating

```bash
docker compose ps              # the state of the services
docker compose logs -f backend # the API log
docker compose logs -f frontend
docker compose restart backend
docker compose stop            # stop, keep the data
docker compose down            # remove the containers, keep the volumes
```

The health of the installation:

```bash
curl -s http://127.0.0.1:8088/api/health       # liveness
curl -s http://127.0.0.1:8088/api/health/ready  # readiness, pings the database
```

Both containers also carry a `HEALTHCHECK`, and the frontend only starts once the backend reports healthy.

## Without Docker

The backend and the frontend can also be run directly.

```bash
# the API
cd backend
WJ_DATA_DIR=../data go run ./cmd/server
# it listens on :8080

# the interface
cd frontend
npm ci
npm run dev
# it listens on :5173 and proxies /api to the backend
```

A native run does not read the files of the Compose deployment, so the settings have to be put into the environment by hand. `config.env` is a plain list of assignments and can be read into the shell:

```bash
set -a; . ./config.env; set +a
```

For a production build without a container:

```bash
cd backend && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o server ./cmd/server
cd frontend && npm ci && npm run build
```

Serve the `frontend/dist` directory with any web server and proxy `/api` to the backend. The uploaded files must live on a persistent path that the backend can write to, and the process needs write access to the database directory.

## The Makefile

```
make help            list the targets
make dev-backend     run the API with reload
make dev-frontend    run the interface
make build           build both
make test            run the backend test suite
make lint            go vet
make docker-up       start the stack
make docker-logs     follow the logs
make backup          write a consistent copy of the database
```

## Hardening checklist

- [ ] `WJ_COOKIE_SECURE=true` and TLS in front of the frontend.
- [ ] `WJ_ALLOW_REGISTRATION=false` once the accounts exist.
- [ ] A strong `WJ_ADMIN_PASSWORD`, changed after the first start if it was in `.env`.
- [ ] The `.env` file is not in version control and the password is not reused.
- [ ] The `journal-data` volume is on a disk that is backed up. See the backup document.
- [ ] The host firewall only exposes the reverse proxy, never the container ports.
- [ ] `WJ_LOG_FORMAT=json` if the logs are collected by a system.
