@echo off
cd /d C:\Users\jmbargueno\.cline\worktrees\c5c05\petai\backend
set NODE_ENV=production
set "DATABASE_URL=postgresql://petai_user:petai_password@127.0.0.1:5432/petai_dev?schema=public"
set JWT_ACCESS_SECRET=e2e-bonding-access-secret-0123456789abcdef
set JWT_REFRESH_SECRET=e2e-bonding-refresh-secret-0123456789abcdef
set AI_KEY_ENCRYPTION_KEY=deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567
call npx jest --config ./test/jest-e2e.json test/bonding.e2e-spec.ts --runInBand --forceExit > jest4.log 2>&1
