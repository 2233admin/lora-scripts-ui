// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/**
 * Thin schema field i18n for legacy WebUI.
 * Reuses Evolution EN catalogs (labels/descs/options/tabs/groups) without a full i18n stack rewrite.
 * Chinese path keeps schema-inline label/desc as source of truth.
 */
// EN catalogs are vendored in-repo (ui/src/i18n/) so the project builds standalone.
// `with { type: 'json' }` works in both the Vite 5 pipeline and plain Node (smoke tools).
import labelsEn from './i18n/schemaFieldLabelsEn.json' with { type: 'json' }
import descsEn from './i18n/schemaFieldDescsEn.json' with { type: 'json' }
import optionsEn from './i18n/schemaFieldOptionsEn.json' with { type: 'json' }
import tabsEn from './i18n/schemaTabsEn.json' with { type: 'json' }
import groupsEn from './i18n/schemaGroupsEn.json' with { type: 'json' }

function langOf(lang) {
  const raw = String(lang || 'zh').toLowerCase()
  if (raw.startsWith('en')) return 'en'
  return 'zh'
}

export function resolveFieldLabel(field, lang = 'zh') {
  if (!field) return ''
  if (langOf(lang) !== 'en') return field.label || field.key || ''
  const key = String(field.key || '')
  if (field.label_en) return field.label_en
  if (key && labelsEn[key]) return labelsEn[key]
  return field.label || key
}

export function resolveFieldDesc(field, lang = 'zh') {
  if (!field) return ''
  if (langOf(lang) !== 'en') return field.desc || ''
  const key = String(field.key || '')
  if (field.desc_en) return field.desc_en
  if (key && descsEn[key]) return descsEn[key]
  return field.desc || ''
}

export function resolveOptionLabel(fieldKey, option, lang = 'zh') {
  const value = option && typeof option === 'object' ? option.value ?? option.id ?? option.key : option
  const inline = option && typeof option === 'object' ? option.label || option.name || String(value) : String(option)
  if (langOf(lang) !== 'en') return inline
  const key = String(fieldKey || '')
  // Evolution catalog is flat: "fieldKey|value" → label (not nested buckets).
  if (key && value != null) {
    const flat = optionsEn[`${key}|${String(value)}`]
    if (flat != null && String(flat).trim()) return String(flat)
  }
  const bucket = optionsEn[key]
  if (bucket && typeof bucket === 'object' && value != null && bucket[String(value)] != null) {
    return bucket[String(value)]
  }
  if (option && typeof option === 'object' && option.label_en) return option.label_en
  return inline
}

/** Resolve UI tab label (model/dataset/…/frontier). Falls back to Chinese registry label. */
export function resolveTabLabel(tab, lang = 'zh') {
  if (!tab) return ''
  const key = typeof tab === 'string' ? tab : String(tab.key || '')
  const zh = typeof tab === 'object' ? tab.label || key : key
  if (langOf(lang) !== 'en') return zh
  if (key && tabsEn[key]) return tabsEn[key]
  return zh
}

/** Resolve training-type group labels (LoRA / Edit / …). */
export function resolveGroupLabel(group, lang = 'zh') {
  const raw = String(group || '')
  if (!raw) return ''
  if (langOf(lang) !== 'en') return raw
  if (groupsEn[raw]) return groupsEn[raw]
  return raw
}

/** Section title: prefer title_en / titles catalog is not global; keep ZH unless title_en set. */
export function resolveSectionTitle(section, lang = 'zh') {
  if (!section) return ''
  if (langOf(lang) !== 'en') return section.title || section.id || ''
  if (section.title_en) return section.title_en
  return section.title || section.id || ''
}

export default {
  resolveFieldLabel,
  resolveFieldDesc,
  resolveOptionLabel,
  resolveTabLabel,
  resolveGroupLabel,
  resolveSectionTitle,
}
