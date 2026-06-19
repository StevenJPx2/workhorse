## ADDED Requirements

### Requirement: Plugin interface exists
The module SHALL export a `Plugin` interface with `name`, an optional `version`, and a `setup(context)` method that receives `GlobalContext`.

#### Scenario: Plugin implementation
- **WHEN** a plugin is authored against the `Plugin` interface
- **THEN** it compiles without missing required members

### Requirement: definePlugin wrapper exists
The module SHALL export a `definePlugin(plugin)` factory that returns the plugin object unchanged (a type-narrowing helper).

#### Scenario: Factory usage
- **WHEN** `definePlugin({ name: "github", setup: () => {} })` is called
- **THEN** it returns a `Plugin` typed object
