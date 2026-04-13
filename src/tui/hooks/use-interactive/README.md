# useInteractive

Standardized hover/press state management for interactive TUI elements.

## Usage

```tsx
import { useInteractive } from "@/hooks";

function Button(props: ButtonProps) {
  const { theme } = useTheme();
  const { isHighlighted, interactiveProps } = useInteractive({
    disabled: props.disabled,
    onPress: props.onPress,
  });

  const bgColor = () => (isHighlighted() ? theme().bg.highlight : theme().bg.base);

  return (
    <box backgroundColor={bgColor()} {...interactiveProps}>
      <text>{props.label}</text>
    </box>
  );
}
```

## API

### Options

| Option     | Type                         | Description                  |
| ---------- | ---------------------------- | ---------------------------- |
| `disabled` | `boolean`                    | Disable all interactions     |
| `onPress`  | `() => void`                 | Called on mouseDown          |
| `onHover`  | `(hovered: boolean) => void` | Called on hover state change |

### Return Value

| Property           | Type                | Description                  |
| ------------------ | ------------------- | ---------------------------- |
| `isHovered`        | `Accessor<boolean>` | Currently hovered            |
| `isPressed`        | `Accessor<boolean>` | Currently being pressed      |
| `isHighlighted`    | `Accessor<boolean>` | Alias for isHovered          |
| `interactiveProps` | `InteractiveProps`  | Props to spread onto element |

### InteractiveProps

The `interactiveProps` object contains all mouse event handlers and should be spread onto the interactive element:

```tsx
<box {...interactiveProps}>
```

This attaches:

- `onMouseOver` - Sets hovered state
- `onMouseOut` - Clears hovered/pressed state
- `onMouseDown` - Sets pressed state, calls onPress
- `onMouseUp` - Clears pressed state

## Notes

- OpenTUI does not support `onFocus`/`onBlur` on box elements, so focus handling is not included
- The `isHighlighted` accessor is an alias for `isHovered` for convenience in styling
- When disabled, hover/press states won't change but `onMouseOut` still fires to reset state
