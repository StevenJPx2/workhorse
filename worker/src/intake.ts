// The intake surface, bound to this worker's plugin registry.
//
// @workhorse/intake takes attachment providers as a parameter so it does not
// depend on every plugin. This is the one place that supplies them — the same
// composition-root role ./registry plays for tools.

import { createIntake } from "@workhorse/intake";
import { attachmentProviders } from "./registry";

/**
 * Bound once at module level, not per request.
 *
 * The plugin list is static, so the provider map is too — rebuilding it per call
 * would re-walk every plugin for no new information.
 */
export const intake = createIntake(attachmentProviders());
