/**
 * Connector registry — given a `FeedConnectorKind` from a FeedConnection row,
 * return a fresh connector instance. Used by the worker.
 */

import type { FeedConnector, FeedConnectorKind } from "./connector";
import { type GenericXmlConfig, GenericXmlConnector } from "./connectors/generic-xml";
import { KyeroConnector } from "./connectors/kyero";
import { ResaleOnlineConnector } from "./connectors/resale-online";

export type ConnectorFactoryArgs = {
  /** Required only for GENERIC_XML — caller supplies the agency's mapping. */
  genericXmlConfig?: GenericXmlConfig;
};

export function makeConnector(
  kind: FeedConnectorKind,
  args: ConnectorFactoryArgs = {},
): FeedConnector {
  switch (kind) {
    case "KYERO":
      return new KyeroConnector();
    case "RESALE_ONLINE":
      return new ResaleOnlineConnector();
    case "GENERIC_XML":
      if (!args.genericXmlConfig) {
        throw new Error("GENERIC_XML requires a fieldMappings config");
      }
      return new GenericXmlConnector(args.genericXmlConfig);
  }
}
