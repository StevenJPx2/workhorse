## ADDED Requirements

### Requirement: Database type placeholder exists
The module SHALL export a `Database` interface/type that the runtime plane can reference without importing SQLite or ORM specifics.

#### Scenario: Referencing Database
- **WHEN** `GlobalContext` declares a `db: Database` field
- **THEN** the field type resolves from the module export

### Requirement: Database type is intentionally minimal
The `Database` type SHALL expose no methods in this iteration beyond a structural tag (`_: "database"`) so that later changes can add tables/methods without breaking call sites.

#### Scenario: Construction placeholder
- **WHEN** code creates an object satisfying `Database`
- **THEN** it compiles without requiring SQLite-specific members
