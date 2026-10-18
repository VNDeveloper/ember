<script setup lang="ts">
import { Check, ChevronDown, Flag, Plus, Timer } from 'lucide-vue-next'
import { computed, nextTick, ref, type Directive } from 'vue'
import { finishLine, roadmap, type MilestoneRow, type StepRow } from '../../core/goalView'
import { goalStatus } from '../../core/goals'
import type { Goal } from '../../core/model'
import { useEmberStore } from '../../stores/ember'
import { useUiStore } from '../../stores/ui'
import { popClass } from '../anim'
import { withFocusRescue } from '../focusRescue'
import RowMenu from '../RowMenu.vue'
import TitleEditPanel from '../TitleEditPanel.vue'
import StepEditPanel from './StepEditPanel.vue'

const props = defineProps<{ goal: Goal }>()
const ember = useEmberStore()
const ui = useUiStore()

const rows = computed(() => roadmap(props.goal, ember.tally.spent, ember.tally.spentToday, ember.selection))
const finish = computed(() => finishLine(props.goal))
/** Finishing the plan isn't proof the goal is done: ask, and offer more milestones instead. */
const askAchieved = computed(() => finish.value.reached && goalStatus(props.goal) !== 'achieved')
const justDone = (stepId: string) => ember.lastDone?.key === `step:${stepId}`
/** The selected step's newest filled block pops when a focus session has just finished. */
const sessionJustEnded = computed(() => ember.completions > 0 && ember.timer.phase === 'break')
const newestBlock = (blocks: string[]) => blocks.reduce((last, b, i) => (b === 'remaining' ? last : i), -1)

const vFocus: Directive<HTMLElement> = { mounted: (el) => el.focus() }

/** Rough estimate for a milestone without steps: one inline hours input at a time. */
const estimating = ref<string | null>(null)
const estHours = ref<string | number>('')
function openEst(r: MilestoneRow) {
  const m = props.goal.milestones.find((x) => x.id === r.id)
  estHours.value = m?.estMin != null ? String(m.estMin / 60) : ''
  estimating.value = r.id
}
function saveEst(r: MilestoneRow) {
  const h = Number(estHours.value)
  if (Number.isFinite(h) && h > 0) ember.setMilestoneEstimate(props.goal.id, r.id, h)
  estimating.value = null
}
function clearEst(r: MilestoneRow) {
  ember.setMilestoneEstimate(props.goal.id, r.id, null)
  estimating.value = null
}

const isExpanded = (r: MilestoneRow) => ui.expanded[r.id] ?? r.current
const toggle = (r: MilestoneRow) => { ui.expanded[r.id] = !isExpanded(r) }
const addingStepTo = (msId: string) => ui.adding?.kind === 'step' && ui.adding.msId === msId

function startStep(msId: string) {
  ui.adding = { kind: 'step', msId }
  ui.draft = ''
}
function startMilestone() {
  ui.adding = { kind: 'milestone' }
  ui.draft = ''
}
const root = ref<HTMLElement | null>(null)

/** Esc closes the input and puts focus back on the button that opened it. */
function onEsc() {
  const was = ui.adding
  cancel()
  void nextTick(() => {
    const selector = was?.kind === 'step' ? `[data-add-step="${was.msId}"]` : '.rm-add-ms'
    root.value?.querySelector<HTMLElement>(selector)?.focus()
  })
}

function deleteStep(e: Event, s: StepRow) {
  const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('.step-item') ?? null
  void withFocusRescue(row, e, () => {
    ui.editing = null
    ui.showUndo(ember.deleteStep(s.target))
  })
}
function deleteMilestone(msId: string) {
  ui.editing = null
  ui.showUndo(ember.deleteMilestone(props.goal.id, msId))
}
function renameMilestone(msId: string, title: string) {
  ember.renameMilestone(props.goal.id, msId, title)
  ui.editing = null
}

function cancel() {
  ui.adding = null
}
/** Leaving the field cancels, but switching to another window or app doesn't. */
function onBlur() {
  if (document.hasFocus()) cancel()
}
function commit(e: KeyboardEvent) {
  if (e.isComposing) return
  const a = ui.adding
  if (!a) return
  const added = a.kind === 'step'
    ? ember.addStep(props.goal.id, a.msId, ui.draft)
    : ember.addMilestone(props.goal.id, ui.draft)
  if (added) ui.draft = ''
}
</script>

<template>
  <section ref="root" class="roadmap">
    <div class="rm-legend">
      <span><i class="blk is-earlier"></i>Earlier sessions</span>
      <span><i class="blk is-today"></i>Today</span>
      <span><i class="blk is-remaining"></i>Estimate remaining</span>
      <span>1 block = 25 min</span>
    </div>

    <div class="rm-list">
      <div v-for="r in rows" :key="r.id" class="rm-ms">
        <div class="rm-rail">
          <div class="rm-line" :class="{ 'is-complete': r.complete }"></div>
          <div class="rm-marker" :class="{ 'is-complete': r.complete, 'is-current': r.current && !r.complete }">
            <Check v-if="r.complete" :size="16" :stroke-width="3.5" />
            <span v-else>{{ r.num }}</span>
          </div>
        </div>
        <div class="rm-body">
          <div class="rm-head-row">
            <button class="rm-head" :aria-expanded="isExpanded(r)" @click="toggle(r)">
              <span class="rm-title">{{ r.title }}</span>
              <span v-if="r.current" class="tag tag-accent">You are here</span>
              <span class="rm-ledger" :class="{ 'is-guess': r.estimate?.guess }">{{ r.estimate ? r.estimate.text : r.ledger }}</span>
              <span class="rm-count">{{ r.count }}</span>
              <ChevronDown :size="18" :stroke-width="2.5" class="rm-chev" :class="{ 'is-open': isExpanded(r) }" />
            </button>
            <RowMenu :menu-key="`ms:${r.id}`" :label="r.title" @delete="deleteMilestone(r.id)" />
          </div>
          <TitleEditPanel
            v-if="ui.editing === `ms:${r.id}`"
            what="milestone"
            :title="r.title"
            @save="(t) => renameMilestone(r.id, t)"
            @delete="deleteMilestone(r.id)"
          />
          <div v-if="r.estimate" class="rm-est">
            <button v-if="estimating !== r.id" class="btn btn-ghost rm-est-set" @click="openEst(r)">{{ r.estimate.guess ? 'Set estimate' : 'Change estimate' }}</button>
            <template v-else>
              <label class="rm-est-label">Rough hours
                <input v-model="estHours" class="input input-sm rm-est-input" type="number" min="0.5" max="100" step="0.5" />
              </label>
              <button class="btn btn-primary rm-est-save" :disabled="!(Number(estHours) > 0)" @click="saveEst(r)">Save</button>
              <button v-if="!r.estimate.guess" class="btn btn-ghost rm-est-clear" @click="clearEst(r)">Clear</button>
              <button class="btn btn-ghost rm-est-cancel" @click="estimating = null">Cancel</button>
            </template>
          </div>
          <div class="rm-segs"><span v-for="(isDone, i) in r.segments" :key="i" :class="{ 'is-done': isDone }"></span></div>
          <div v-if="isExpanded(r)" class="rm-steps">
            <div v-for="s in r.steps" :key="s.id" class="step-item">
              <div class="step-row" :class="{ 'is-done': s.done, 'is-selected': s.selected }">
                <button
                  class="check"
                  :class="[{ 'is-done': s.done }, s.done && justDone(s.id) ? popClass(ember.lastDone!.n) : '']"
                  role="checkbox"
                  :aria-checked="s.done"
                  :aria-label="`${s.title}, ${r.title}`"
                  @click="ember.toggleStep(s.target)"
                >
                  <Check v-if="s.done" :size="14" :stroke-width="3.5" />
                </button>
                <span class="sr-title">{{ s.title }}</span>
                <div class="sr-blocks" aria-hidden="true">
                  <i v-for="(b, i) in s.blocks" :key="i" class="blk" :class="[`is-${b}`, sessionJustEnded && s.selected && i === newestBlock(s.blocks) ? popClass(ember.completions) : '']"></i>
                </div>
                <div class="sr-ledger tabular">
                  <span>{{ s.ledger }}</span>
                  <span class="sr-note" :class="{ 'is-accent': s.noteAccent }">{{ s.note }}</span>
                </div>
                <button
                  class="icon-btn sr-focus"
                  :class="{ 'is-on': s.selected, 'is-hidden': s.done }"
                  aria-label="Focus on this step"
                  title="Focus on this step"
                  @click="ember.select(s.target)"
                >
                  <Timer :size="16" :stroke-width="2.25" />
                </button>
                <RowMenu :menu-key="`step:${s.id}`" :label="s.title" @delete="(e) => deleteStep(e, s)" />
              </div>
              <StepEditPanel
                v-if="ui.editing === `step:${s.id}`"
                :target="s.target"
                :title="s.title"
                :est-min="s.estMin"
                @delete="(e) => deleteStep(e, s)"
              />
            </div>
            <div v-if="addingStepTo(r.id)" class="rm-add-input">
              <input
                v-model="ui.draft"
                v-focus
                class="input rm-step-input"
                placeholder="New step (estimated 2 sessions), Enter to add"
                aria-label="New step"
                @keydown.enter="commit"
                @keydown.esc="onEsc"
                @blur="onBlur"
              />
            </div>
            <button v-else class="btn btn-ghost rm-add-step" :data-add-step="r.id" @click="startStep(r.id)">
              <Plus :size="14" :stroke-width="2.5" />Add step
            </button>
          </div>
        </div>
      </div>

      <div class="rm-ms">
        <div class="rm-rail"><div class="rm-line rm-line-stub"></div></div>
        <div class="rm-body rm-body-stub">
          <input
            v-if="ui.adding?.kind === 'milestone'"
            v-model="ui.draft"
            v-focus
            class="input rm-ms-input"
            placeholder="Milestone name, Enter to add"
            aria-label="New milestone"
            @keydown.enter="commit"
            @keydown.esc="onEsc"
            @blur="onBlur"
          />
          <button v-else class="btn btn-secondary rm-add-ms" @click="startMilestone">
            <Plus :size="16" :stroke-width="2.5" />Add milestone
          </button>
        </div>
      </div>

      <div class="rm-finish">
        <div class="rm-flag" :class="{ 'is-reached': finish.reached }"><Flag :size="16" :stroke-width="2.5" /></div>
        <div class="rm-finish-text">
          <span class="rm-finish-title">{{ finish.title }}</span>
          <span class="rm-finish-outcome">{{ finish.text }}</span>
          <div v-if="askAchieved" class="rm-finish-ask">
            <span>Every step is done. Is the goal achieved?</span>
            <div class="rm-finish-actions">
              <button class="btn btn-primary rm-achieve" @click="ember.setGoalStatus(goal.id, 'achieved')">Mark achieved</button>
              <button class="btn btn-secondary rm-more" @click="startMilestone">Add a milestone</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roadmap { display: flex; flex-direction: column; gap: var(--space-6); }
.rm-legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); font-size: 12px; color: var(--color-neutral-700); }
.rm-legend span { display: flex; align-items: center; gap: 6px; }
.rm-legend .blk { width: 12px; height: 12px; }
.blk { display: block; flex: none; width: 14px; height: 14px; }
.blk.is-earlier { background: var(--color-text); }
.blk.is-today { background: var(--color-accent); }
.blk.is-remaining { box-shadow: inset 0 0 0 2px var(--color-neutral-400); }

.rm-list { display: flex; flex-direction: column; }
.rm-ms { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--space-4); }
.rm-rail { position: relative; }
.rm-line { position: absolute; top: 0; bottom: 0; left: 15px; width: 2px; background: var(--color-neutral-300); }
.rm-line.is-complete { background: var(--color-accent); }
.rm-line-stub { bottom: auto; height: 16px; }
.rm-marker {
  position: relative; width: 32px; height: 32px; display: grid; place-items: center;
  background: var(--color-bg); color: var(--color-neutral-700); box-shadow: inset 0 0 0 2px var(--color-neutral-400);
  font: 800 13px/1 var(--font-heading);
}
.rm-marker.is-current { background: var(--color-text); color: var(--color-bg); box-shadow: inset 0 0 0 2px var(--color-text); }
.rm-marker.is-complete { background: var(--color-accent); color: var(--color-bg); box-shadow: inset 0 0 0 2px var(--color-accent); }

.rm-body { min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); padding: 4px 0 var(--space-6); }
.rm-head-row { display: flex; align-items: center; gap: var(--space-2); }
.rm-head-row .rm-head { flex: 1; min-width: 0; }
.rm-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3);
  padding: 0; border: 0; background: none; color: var(--color-text); text-align: left;
}
.rm-title { font: 800 20px/1.2 var(--font-heading); }
.rm-ledger { margin-left: auto; font-size: 12px; color: var(--color-neutral-700); white-space: nowrap; }
.rm-ledger.is-guess { font-style: italic; }
.rm-est { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.rm-est-set { padding-inline: 0; font-size: 13px; }
.rm-est-label { display: inline-flex; align-items: center; gap: var(--space-2); font-size: 13px; }
.rm-est-input { width: 80px; }
.rm-count { font-size: 13px; font-weight: 700; white-space: nowrap; }
.rm-chev { flex: none; transition: transform .2s; }
.rm-chev.is-open { transform: rotate(180deg); }
.rm-segs { display: flex; gap: 3px; }
.rm-segs span { flex: 1; height: 8px; background: var(--color-neutral-300); }
.rm-segs span.is-done { background: var(--color-accent); }

.rm-steps { display: flex; flex-direction: column; border-top: 1px solid var(--color-divider); }
.step-row {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, auto) 104px 28px 28px; gap: var(--space-3);
  align-items: center; padding: 6px var(--space-2);
}
.step-item { border-bottom: 1px solid var(--color-divider); }
.step-row.is-selected { background: var(--color-accent-100); }
.sr-title { font-size: 14px; overflow-wrap: anywhere; }
.step-row.is-done .sr-title { text-decoration: line-through; color: var(--color-neutral-700); }
.sr-blocks { display: flex; flex-wrap: wrap; gap: 3px; max-width: 220px; }
.sr-ledger { display: flex; flex-direction: column; font-size: 12px; }
.sr-note { color: var(--color-neutral-700); }
.sr-note.is-accent { color: var(--color-accent-700); font-weight: 700; }
.rm-add-input { padding-top: var(--space-2); }
.rm-add-step { align-self: flex-start; padding-left: 0; }
.rm-body-stub { padding: 0 0 var(--space-6); }
.rm-ms-input { max-width: 320px; }
.rm-add-ms { align-self: flex-start; }

.rm-finish { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--space-4); align-items: start; }
.rm-flag {
  width: 32px; height: 32px; display: grid; place-items: center;
  background: var(--color-bg); color: var(--color-text); box-shadow: inset 0 0 0 2px var(--color-text);
}
.rm-flag.is-reached { background: var(--color-accent); color: var(--color-bg); box-shadow: inset 0 0 0 2px var(--color-accent); }
.rm-finish-text { display: flex; flex-direction: column; gap: 4px; padding-top: 2px; }
.rm-finish-ask { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); font-size: 14px; }
.rm-finish-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.rm-finish-title { font: 800 20px/1.2 var(--font-heading); }
.rm-finish-outcome { font-size: 14px; color: var(--color-neutral-800); text-wrap: pretty; }

@media (max-width: 720px) {
  .step-row { grid-template-columns: 22px minmax(0, 1fr) 28px; row-gap: var(--space-2); }
  .sr-blocks { grid-column: 2; grid-row: 2; }
  .sr-ledger { grid-column: 2; grid-row: 3; }
  .sr-focus { grid-column: 3; grid-row: 1; }
  .step-row .row-menu { grid-column: 3; grid-row: 2; }
}
@media (max-width: 560px) {
  .rm-title { flex-basis: 100%; }
}
</style>
