import { useState } from 'react';
import api, { errMsg } from '../api/client.js';
import useApi from '../utils/useApi.js';
import { Badge, Empty, Field, Loader, Modal, PageHeader, useToast } from '../components/ui.jsx';

const STAGES = [
  { name: 'Applied', hint: 'New applications', tone: 'applied' },
  { name: 'Screening', hint: 'Under review', tone: 'screening' },
  { name: 'Interview', hint: 'In interview process', tone: 'interview' },
  { name: 'Offer', hint: 'Offer extended', tone: 'offer' },
  { name: 'Hired', hint: 'Successfully hired', tone: 'hired' },
  { name: 'Joined', hint: 'Successfully joined', tone: 'joined' },
  { name: 'Rejected', hint: 'Not selected', tone: 'rejected' },
  { name: 'Dropped', hint: 'Withdrew from process', tone: 'dropped' },
];

function OpeningForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', department: '', location: '', employmentType: 'full-time', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/recruitment/openings', form);
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  return <Modal title="Create job opening" onClose={onClose} wide>
    <form onSubmit={submit}>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="form-grid">
        <Field label="Job title"><input value={form.title} onChange={update('title')} maxLength={120} required /></Field>
        <Field label="Department"><input value={form.department} onChange={update('department')} maxLength={80} /></Field>
        <Field label="Location"><input value={form.location} onChange={update('location')} maxLength={120} /></Field>
        <Field label="Employment type"><select value={form.employmentType} onChange={update('employmentType')}><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></Field>
      </div>
      <Field label="Description"><textarea value={form.description} onChange={update('description')} maxLength={3000} /></Field>
      <div className="row gap end"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Create position'}</button></div>
    </form>
  </Modal>;
}

function CandidateForm({ openings, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: '', opening: openings[0]?._id || '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/recruitment/candidates', form);
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  return <Modal title="Add candidate" onClose={onClose} wide>
    <form onSubmit={submit}>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="form-grid">
        <Field label="Full name"><input value={form.name} onChange={update('name')} maxLength={120} required /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={update('email')} maxLength={254} required /></Field>
        <Field label="Phone"><input value={form.phone} onChange={update('phone')} maxLength={40} /></Field>
        <Field label="Application source"><input value={form.source} onChange={update('source')} placeholder="Referral, LinkedIn…" maxLength={100} /></Field>
      </div>
      <Field label="Open position"><select value={form.opening} onChange={update('opening')} required>{openings.map((opening) => <option key={opening._id} value={opening._id}>{opening.title}{opening.department ? ` · ${opening.department}` : ''}</option>)}</select></Field>
      <Field label="Notes"><textarea value={form.notes} onChange={update('notes')} maxLength={3000} /></Field>
      <div className="row gap end"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Add to pipeline'}</button></div>
    </form>
  </Modal>;
}

export default function Recruitment() {
  const toast = useToast();
  const [tab, setTab] = useState('pipeline');
  const [openingFilter, setOpeningFilter] = useState('');
  const [query, setQuery] = useState('');
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [password, setPassword] = useState(null);
  const [draggedId, setDraggedId] = useState('');
  const pipeline = useApi('/recruitment/pipeline', { opening: openingFilter || undefined, q: query || undefined });
  const openings = useApi('/recruitment/openings', { status: 'all' });
  const openPositions = openings.data?.items.filter((opening) => opening.status === 'open') || [];
  const candidates = pipeline.data?.items || [];

  const refresh = () => { pipeline.reload(); openings.reload(); };
  const moveCandidate = async (candidate, stage) => {
    if (candidate.stage === stage) return;
    try {
      await api.patch(`/recruitment/candidates/${candidate._id}/stage`, { stage });
      toast(`${candidate.name} moved to ${stage}.`);
      pipeline.reload();
    } catch (error) {
      toast(errMsg(error), 'err');
    }
  };
  const toggleOpening = async (opening) => {
    try {
      await api.patch(`/recruitment/openings/${opening._id}/status`, { status: opening.status === 'open' ? 'closed' : 'open' });
      toast(`${opening.title} is now ${opening.status === 'open' ? 'closed' : 'open'}.`);
      openings.reload();
    } catch (error) {
      toast(errMsg(error), 'err');
    }
  };
  const convertCandidate = async (candidate) => {
    try {
      const { data } = await api.post(`/recruitment/candidates/${candidate._id}/convert`);
      setPassword({ name: data.employee.name, employeeId: data.employee.employeeId, value: data.temporaryPassword });
      toast(`${candidate.name} was added as an employee.`);
      refresh();
    } catch (error) {
      toast(errMsg(error), 'err');
    }
  };

  return <>
    <PageHeader title="Recruitment" sub="Manage open positions and move candidates through your hiring pipeline.">
      {tab === 'pipeline' && openPositions.length > 0 && <button className="btn accent" onClick={() => setShowCandidateForm(true)}>Add candidate</button>}
      <button className="btn" onClick={() => setShowOpeningForm(true)}>New position</button>
    </PageHeader>
    <div className="tabs recruitment-tabs" role="tablist" aria-label="Recruitment sections">
      <button type="button" role="tab" aria-selected={tab === 'pipeline'} className={tab === 'pipeline' ? 'on' : ''} onClick={() => setTab('pipeline')}>Pipeline</button>
      <button type="button" role="tab" aria-selected={tab === 'openings'} className={tab === 'openings' ? 'on' : ''} onClick={() => setTab('openings')}>Open positions <span>{openPositions.length}</span></button>
    </div>
    {openings.error && <div className="error" role="alert">{openings.error}</div>}
    {tab === 'pipeline' ? <>
      <div className="recruitment-toolbar">
        <label className="recruitment-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search candidates…" aria-label="Search candidates" /></label>
        <select value={openingFilter} onChange={(event) => setOpeningFilter(event.target.value)} aria-label="Filter by job opening">
          <option value="">All positions</option>{openings.data?.items.map((opening) => <option key={opening._id} value={opening._id}>{opening.title}</option>)}
        </select>
        <span className="recruitment-total">Total: {pipeline.data?.total ?? '—'} candidates</span>
      </div>
      {pipeline.error && <div className="error" role="alert">{pipeline.error}</div>}
      {openPositions.length === 0 && !openings.loading && <div className="notice">Create an open position before adding candidates to the pipeline.</div>}
      {pipeline.data?.truncated && <div className="notice">Showing the 500 most recently updated candidates. Refine your search to see a smaller group.</div>}
      {pipeline.data && <div className="pipeline-summary" aria-label="Candidates by stage">
        {STAGES.map((stage) => <div className={`pipeline-summary-card ${stage.tone}`} key={stage.name}>
          <strong>{stage.name}<span>{pipeline.data.counts?.[stage.name] || 0}</span></strong><small>{stage.hint}</small>
        </div>)}
      </div>}
      {pipeline.loading && !pipeline.data ? <Loader /> : pipeline.data && pipeline.data.total === 0 ? <div className="card"><Empty title="No candidates yet">Create a position, then add candidates to start your pipeline.</Empty></div> :
        <div className="pipeline-board" aria-label="Candidate pipeline">
          {STAGES.map((stage) => {
            const stageCandidates = candidates.filter((candidate) => candidate.stage === stage.name);
            return <section
              className={`pipeline-lane ${stage.tone} ${draggedId ? 'drop-ready' : ''}`}
              key={stage.name}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const candidate = candidates.find((item) => item._id === (event.dataTransfer.getData('text/plain') || draggedId));
                if (candidate) moveCandidate(candidate, stage.name);
                setDraggedId('');
              }}
              aria-label={`${stage.name}: ${pipeline.data?.counts?.[stage.name] || 0} candidates`}
            >
              <header className="pipeline-lane-head">
                <div><h2>{stage.name}</h2><p>{stage.hint}</p></div>
                <span>{pipeline.data?.counts?.[stage.name] || 0}</span>
              </header>
              <div className="pipeline-cards">
                {stageCandidates.map((candidate) => <article
                  className="candidate-card"
                  key={candidate._id}
                  draggable
                  onDragStart={(event) => { event.dataTransfer.setData('text/plain', candidate._id); setDraggedId(candidate._id); }}
                  onDragEnd={() => setDraggedId('')}
                >
                  <div className="candidate-card-heading"><span className="candidate-avatar">{candidate.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{candidate.name}</strong><span>{candidate.opening?.title || 'Position removed'}</span></div></div>
                  <a className="candidate-email" href={`mailto:${candidate.email}`}>{candidate.email}</a>
                  {candidate.source && <span className="candidate-source">{candidate.source}</span>}
                  {candidate.notes && <p className="candidate-notes" title={candidate.notes}>{candidate.notes}</p>}
                  <div className="candidate-card-footer">
                    <label className="sr-only" htmlFor={`stage-${candidate._id}`}>Move {candidate.name} to stage</label>
                    <select id={`stage-${candidate._id}`} value={candidate.stage} onChange={(event) => moveCandidate(candidate, event.target.value)} aria-label={`Move ${candidate.name} to stage`}>
                      {STAGES.map((item) => <option key={item.name}>{item.name}</option>)}
                    </select>
                    {candidate.stage === 'Hired' && !candidate.convertedEmployee && <button type="button" className="btn accent sm" onClick={() => convertCandidate(candidate)}>Create employee</button>}
                    {candidate.convertedEmployee && <Badge tone="good">Employee created</Badge>}
                  </div>
                </article>)}
                {!stageCandidates.length && <div className="pipeline-empty">Drop a candidate here</div>}
              </div>
            </section>;
          })}
        </div>}
    </> : <section className="opening-list">
      {openings.loading && !openings.data ? <Loader /> : !openings.data?.items.length ? <div className="card"><Empty title="No positions yet">Create your first job position to start recruiting.</Empty></div> :
        openings.data.items.map((opening) => <article className="opening-card" key={opening._id}>
          <div className="opening-card-main"><div className="opening-card-title"><h2>{opening.title}</h2><Badge tone={opening.status === 'open' ? 'good' : 'mute'}>{opening.status}</Badge></div>
            <p>{[opening.department, opening.location, opening.employmentType].filter(Boolean).join(' · ')}</p>
            {opening.description && <p className="opening-description">{opening.description}</p>}
            <small>{opening.candidateCount} candidate{opening.candidateCount === 1 ? '' : 's'}</small>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => toggleOpening(opening)}>{opening.status === 'open' ? 'Close position' : 'Reopen position'}</button>
        </article>)}
    </section>}
    {showOpeningForm && <OpeningForm onClose={() => setShowOpeningForm(false)} onSaved={() => { setShowOpeningForm(false); openings.reload(); toast('Job position created.'); }} />}
    {showCandidateForm && <CandidateForm openings={openPositions} onClose={() => setShowCandidateForm(false)} onSaved={() => { setShowCandidateForm(false); pipeline.reload(); toast('Candidate added to the pipeline.'); }} />}
    {password && <Modal title="Employee account created" onClose={() => setPassword(null)}>
      <p><strong>{password.name}</strong> was added as employee <strong>{password.employeeId}</strong>. Share this temporary password securely; it is shown only once.</p>
      <div className="temp">{password.value}</div>
      <div className="row end" style={{ marginTop: '1rem' }}><button type="button" className="btn" onClick={() => setPassword(null)}>Done</button></div>
    </Modal>}
  </>;
}
