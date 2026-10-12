<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { companySuggestions } from '../../core/companies'
import { goalOptions } from '../../core/goals'
import { RESOURCE_STATUSES, RESOURCE_TYPES, type Billing, type Resource } from '../../core/model'
import { STATUS_LABEL, TYPE_LABEL } from '../../core/resources'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ resource: Resource }>()
const emit = defineEmits<{ delete: [e: Event] }>()
const ember = useEmberStore()
const ui = useUiStore()

const BILLING: [Billing, string][] = [['free', 'Free'], ['once', 'One-off'], ['month', 'Monthly'], ['year', 'Yearly']]

const title = ref(props.resource.title)
const url = ref(props.resource.url)
const company = ref(props.resource.company)
const type = ref(props.resource.type)
const status = ref(props.resource.status)
const goals = computed(() => goalOptions(ember.goals, props.resource.goalId))
const startGoal = props.resource.goalId && goals.value.some((g) => g.id === props.resource.goalId) ? props.resource.goalId : ''
const goalId = ref(startGoal)
const billing = ref<Billing>(props.resource.billing)
const price = ref(props.resource.price == null ? '' : String(props.resource.price))
const renewsOn = ref(props.resource.renewsOn ?? '')
const notes = ref(props.resource.notes)
const titleInput = ref<HTMLInputElement | null>(null)

const suggestions = computed(() => companySuggestions(ember.resources, ''))
const priceValue = computed(() => Number(price.value))
const paid = computed(() => billing.value !== 'free')
const recurring = computed(() => billing.value === 'month' || billing.value === 'year')
const canSave = computed(() => !paid.value || (Number.isFinite(priceValue.value) && priceValue.value > 0))

onMounted(() => titleInput.value?.focus())

function save() {
  if (!canSave.value) return
  ember.updateResource(props.resource.id, {
    title: title.value,
    url: url.value,
    company: company.value,
    type: type.value,
    status: status.value,
    // Only touch the link if the user changed it: a resource whose goal was deleted keeps it for undo.
    ...(goalId.value !== startGoal ? { goalId: goalId.value || null } : {}),
    billing: billing.value,
    price: paid.value ? priceValue.value : null,
    renewsOn: recurring.value && renewsOn.value ? renewsOn.value : null,
    notes: notes.value,
  })
  ui.editing = null
}

function onEnter(e: KeyboardEvent) {
  if (!e.isComposing) save()
}
</script>

<template>
  <div class="edit-panel resource-edit" role="group" :aria-label="`Edit “${resource.title}”`">
    <label class="re-field"><span class="label">Title</span>
      <input ref="titleInput" v-model="title" class="input re-title" @keydown.enter="onEnter" />
    </label>
    <div class="re-row">
      <label class="re-field re-grow"><span class="label">Link</span>
        <input v-model="url" class="input re-url" inputmode="url" @keydown.enter="onEnter" />
      </label>
      <label class="re-field"><span class="label">Company</span>
        <input v-model="company" class="input re-company" list="re-companies" @keydown.enter="onEnter" />
        <datalist id="re-companies"><option v-for="c in suggestions" :key="c" :value="c"></option></datalist>
      </label>
    </div>
    <div class="re-row">
      <label class="re-field"><span class="label">Type</span>
        <select v-model="type" class="input re-type">
          <option v-for="t in RESOURCE_TYPES" :key="t" :value="t">{{ TYPE_LABEL[t] }}</option>
        </select>
      </label>
      <label class="re-field"><span class="label">Goal</span>
        <select v-model="goalId" class="input re-goal">
          <option value="">No goal</option>
          <option v-for="g in goals" :key="g.id" :value="g.id">{{ g.title }}</option>
        </select>
      </label>
    </div>
    <p v-if="type === 'membership'" class="re-hint">While you’re using it, your other {{ company || 'company' }} resources show as “In {{ title || 'this membership' }}”.</p>
    <div class="re-field"><span class="label">Status</span>
      <div class="seg re-status" role="radiogroup" aria-label="Status">
        <label v-for="s in RESOURCE_STATUSES" :key="s" class="seg-opt">
          <input v-model="status" type="radio" :name="`re-status-${resource.id}`" :value="s" />{{ STATUS_LABEL[s] }}
        </label>
      </div>
    </div>
    <div class="re-field"><span class="label">Cost</span>
      <div class="seg re-billing" role="radiogroup" aria-label="Cost">
        <label v-for="[b, l] in BILLING" :key="b" class="seg-opt">
          <input v-model="billing" type="radio" :name="`re-billing-${resource.id}`" :value="b" />{{ l }}
        </label>
      </div>
    </div>
    <div v-if="paid" class="re-row">
      <label class="re-field"><span class="label">Price, £</span>
        <input v-model="price" class="input re-price tabular" type="number" min="0.01" step="0.01" inputmode="decimal" @keydown.enter="onEnter" />
      </label>
      <label v-if="recurring" class="re-field"><span class="label">Renews on</span>
        <input v-model="renewsOn" class="input re-renews" type="date" />
      </label>
    </div>
    <label class="re-field"><span class="label">Notes</span>
      <textarea v-model="notes" class="input re-notes" rows="2"></textarea>
    </label>
    <div class="ep-actions">
      <button class="btn btn-primary re-save" :disabled="!canSave" @click="save">Save</button>
      <button class="btn btn-ghost re-cancel" @click="ui.editing = null">Cancel</button>
      <button class="btn btn-ghost ep-delete re-delete" @click="emit('delete', $event)">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.resource-edit { gap: var(--space-3); }
.re-row { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.re-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 160px; min-width: 0; }
.re-grow { flex: 2 1 240px; }
.re-field .input { background: var(--color-bg); }
.re-notes { resize: vertical; }
.re-hint { margin-top: calc(-1 * var(--space-2)); font-size: 12px; color: var(--color-neutral-700); }
</style>
