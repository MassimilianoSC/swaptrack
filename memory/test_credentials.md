# Test credentials (Firebase emulators, project demo-swaptrack only)

Password for every account: SwapDemo2026

- client.admin.telco@swaptrack-demo.test — client_admin (Telco Demo)
- client.office.telco@swaptrack-demo.test — client_office
- client.warehouse.telco@swaptrack-demo.test — client_warehouse
- asp.admin.nord@swaptrack-demo.test — asp_admin (ASP Nord)
- asp.warehouse.nord@swaptrack-demo.test — asp_warehouse (ASP Nord)
- asp.technician.nord@swaptrack-demo.test — asp_technician (ASP Nord)
- same pattern for .centro and .sud (ASP Centro, ASP Sud)

Seed: `cd /app && PATH=/root/toolchain/node22/bin:$PATH node scripts/seed.mjs` (emulators must be running).
