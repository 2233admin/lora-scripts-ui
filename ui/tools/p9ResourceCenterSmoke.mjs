import assert from 'node:assert/strict';
import { buildCatalogDownloadPayload, buildSemanticProviderPatch, mergeCatalogWithLocalResources, normalizeCatalogPayload } from '../src/resourceCenterCatalog.js';

const [proposal, downloadable, ready, gated, compound] = normalizeCatalogPayload({ data: { providers: [
  { provider_id: 'sam', display_name: 'SAM', capability_class: 'mask_proposal', adapter_status: 'resource_only', install_policy: 'manual_review', model_id: 'facebook/sam-vit-base', download: { repository: 'facebook/sam-vit-base' } },
  { provider_id: 'seg-download', runtime_provider_id: 'transformers-semantic-segmentation', display_name: 'Seg', capability_class: 'direct_semantic', adapter_status: 'ready', install_policy: 'manual_review', model_id: 'example/seg', download: { repository: 'example/seg' } },
  { provider_id: 'seg-ready', runtime_provider_id: 'transformers-semantic-segmentation', display_name: 'Seg Ready', capability_class: 'direct_semantic', adapter_status: 'ready', install_policy: 'ready', local_path: 'C:/seg' },
  { provider_id: 'sam3', display_name: 'SAM 3', capability_class: 'mask_proposal', adapter_status: 'resource_only', install_policy: 'gated', download: { repository: 'facebook/sam3', requires_auth: true, requires_license_acceptance: true } },
  { provider_id: 'grounded', display_name: 'Grounded', capability_class: 'compound_grounded', adapter_status: 'manual_review', install_policy: 'manual_review', model_id: 'example/grounded', download: { repository: 'example/grounded' } },
] } });
assert.equal(proposal.provider_role, 'mask_proposal');
assert.equal(proposal.can_select, false);
assert.equal(proposal.can_download, true);
assert.equal(downloadable.can_download, true);
assert.deepEqual(buildCatalogDownloadPayload(downloadable, { acceptLicense: true }), { provider_id: 'seg-download', allow_network: true, accept_license: true, hf_token: '' });
assert.equal(ready.can_select, true);
assert.equal(buildSemanticProviderPatch(ready).semantic_segmentation_model_path, 'C:/seg');
assert.equal(buildSemanticProviderPatch(ready).semantic_segmentation_provider, 'transformers-semantic-segmentation');
assert.equal(gated.adapter_status, 'resource-only');
assert.equal(gated.install_policy, 'gated');
assert.equal(gated.can_download, true);
assert.equal(compound.provider_role, 'compound_grounded');
assert.equal(compound.can_select, false);
const resourceOnly = normalizeCatalogPayload({ providers: [{ provider_id: 'mask2former', capability_class: 'direct_semantic', adapter_status: 'manual_review', install_policy: 'resource_only', download: { repository: 'example/mask2former' } }] })[0];
assert.equal(resourceOnly.can_download, true);
assert.equal(resourceOnly.source_label, '未声明');
const installed = mergeCatalogWithLocalResources([downloadable], [{ provider_ids: ['seg-download'], path: 'C:/models/seg-download' }])[0];
assert.equal(installed.installed, true);
assert.equal(installed.can_select, true);
console.log('P9 vanilla resource-center smoke: PASS');
