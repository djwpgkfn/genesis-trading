/**
 * The AI runtime's capability set is EMPTY of anything execution-related. These are `false` at the
 * type level and there is no port/interface anywhere in this package to place orders, touch Risk,
 * reach the exchange, or run inside the Data Plane. Isolation is structural (INV-S3, INV-D3),
 * not a policy toggle.
 */
export interface AIRuntimeCapabilities {
  readonly account: false;
  readonly orderApi: false;
  readonly risk: false;
  readonly execution: false;
  readonly exchange: false;
  readonly dataPlaneLLM: false; // no LLM call on the Data Plane execution path
}

export const AI_CAPABILITIES: AIRuntimeCapabilities = {
  account: false, orderApi: false, risk: false, execution: false, exchange: false, dataPlaneLLM: false,
};

/** The only thing the AI runtime can emit. */
export const AI_OUTPUT_KIND = 'proposal' as const;
