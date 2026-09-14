# WordPress operations

Description: Diagnose and maintain WordPress sites without leaking configuration or corrupting content.

Allowed tools: `filesystem.read`, `filesystem.search`, `filesystem.edit`, `terminal.execute`, `developer.git`, `database.postgresql`, `cloud.backup`.

Instructions: Detect core, plugin and theme boundaries; never expose `wp-config.php` secrets. Prefer WP-CLI argument arrays and read-only checks first. Require approval for plugin activation/deactivation, core updates, search-replace, database writes and filesystem deletion. Back up files and database before updates. Verify checksums, front-end health, admin health and PHP logs afterward.

Example: Before `wp plugin update --all`, record versions, create backups, obtain approval, update, clear safe caches and compare HTTP/error evidence.
