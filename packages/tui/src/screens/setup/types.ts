/**
 * Types for the Setup screen.
 */

export interface SetupField {
  key: string;
  label: string;
  description: string;
  required: boolean;
  default?: string;
  value?: string;
}

export interface SetupPluginConfig {
  name: string;
  fields: SetupField[];
}

export interface SetupScreenProps {
  plugins: SetupPluginConfig[];
  onComplete: (configs: Record<string, Record<string, string>>) => void;
  onSkip?: () => void;
}
