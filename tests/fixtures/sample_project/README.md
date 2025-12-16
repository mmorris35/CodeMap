# Sample Project for Integration Tests

This is a minimal sample Python project used for CodeMap integration testing.

## Project Structure

- `auth.py` - Authentication module with user validation
- `database.py` - Simple database abstraction layer
- `main.py` - Main application entry point with login and account creation
- `utils.py` - Utility functions for formatting and validation
- `DEVELOPMENT_PLAN.md` - Sample development plan with task structure

## Dependency Graph

The project has the following call dependencies:

```
main.login() -> auth.validate_user()
main.login() -> auth.get_user()
main.login() -> utils.format_timestamp()
main.create_account() -> auth.hash_password()
main.create_account() -> database.get_database()
main.create_account() -> utils.format_timestamp()
main.list_users() -> database.get_database()
main.main() -> main.login()
```

## Expected Outputs

When CodeMap analyzes this project, it should generate:

1. `CODE_MAP.json` with:
   - 4 modules: `auth`, `database`, `main`, `utils`
   - 12+ functions/methods
   - 8+ dependencies

2. `ARCHITECTURE.mermaid` showing module relationships

## Testing

The integration tests use this project to verify:
- Correct symbol extraction
- Accurate dependency detection
- Proper file structure in generated outputs
- Valid Mermaid diagram syntax
