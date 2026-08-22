# Lab 1 Test Inventory

Test files live under `server/tests/lab-01/` (Supertest) and
`client/src/App.test.tsx` (Vitest).

| Test File                                  | Tool      | Test Description                                        |
|---------------------------------------------|-----------|-----------------------------------------------------------|
| `server/tests/lab-01/health.test.ts`         | Supertest | API-01: Health endpoint returns 200 and expected JSON              |
| `server/tests/lab-01/categories.test.ts`     | Supertest | API-02: Categories endpoint returns the four seeded categories     |
| `client/src/App.test.tsx`                    | Vitest    | UI-01: TokTickIT heading renders                                   |
| `client/src/App.test.tsx`                    | Vitest    | UI-02: Loading state changes to category list                      |
| `client/src/App.test.tsx`                    | Vitest    | UI-03: API failure displays a useful error message                 |

## Passing terminal output

### `server` — `npm test`

```
> server@1.0.0 test
> vitest run

 RUN  v4.1.11 /Users/phittayanan/kmutt/year3/Software-engineering/lab-1/toktickit/server

 Test Files  2 passed (2)
      Tests  2 passed (2)
```

### `client` — `npm test`

```
> client@0.0.0 test
> vitest run

 RUN  v4.1.11 /Users/phittayanan/kmutt/year3/Software-engineering/lab-1/toktickit/client

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## End-to-end verification (manual, against live seeded DB)

```
$ curl -s http://localhost:4000/api/health
{"status":"ok","service":"TokTickIT API"}

$ curl -s http://localhost:4000/api/categories
[{"id":1,"name":"Account and Access"},{"id":2,"name":"Hardware"},{"id":3,"name":"Software"},{"id":4,"name":"Network"}]
```
