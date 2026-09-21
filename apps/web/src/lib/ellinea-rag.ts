/** Browser-safe Ellinea RAG exports from the shared package. */
import * as ellineaCore from '@ellines-eip/ellinea-ai';

export type { RagChunk } from '@ellines-eip/ellinea-ai';

export const retrieveEllineaContext = ellineaCore.retrieveEllineaContext;
export const formatRagGrounding = ellineaCore.formatRagGrounding;
