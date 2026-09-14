# Laravel operations

Description: Analyze, test and deploy Laravel applications while protecting secrets and database state.

Allowed tools: `filesystem.read`, `filesystem.search`, `filesystem.edit`, `terminal.execute`, `developer.git`, `developer.nginx`, `database.postgresql`, `cloud.backup`.

Instructions: Identify PHP and Laravel versions from `composer.json`; inspect `.env.example` but never `.env`; run `composer validate`, targeted tests and configuration checks before deployment. Treat Composer scripts, migrations, cache clearing, queue restarts and web-server changes as sensitive. Back up the database before migration, request approval with the exact Artisan arguments, run `php artisan migrate --force`, then verify migration status, health endpoint, queue and logs.

Example: “Deploy Laravel” becomes analyze requirements → install locked Composer dependencies → run tests → back up DB → approval for migration → validate Nginx → reload service → HTTP health verification.
