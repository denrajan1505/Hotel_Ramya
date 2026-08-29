import { crudFor, orderBy } from './firestoreCrud';
import { COLLECTIONS } from '../constants/collections';
import { logAudit } from './auditService';

const referencePersons = crudFor(COLLECTIONS.REFERENCE_PERSONS);

/** Everyone ever added, active or not — Settings needs the full list to manage them. */
export async function listReferencePersons() {
  return referencePersons.list([orderBy('name')]);
}

/** Only active ones — what the Reference picker on a bill should offer. */
export async function listActiveReferencePersons() {
  const all = await listReferencePersons();
  return all.filter((p) => p.active !== false);
}

export async function createReferencePerson(name, user) {
  const id = await referencePersons.create({ name: name.trim(), active: true, createdBy: user?.uid || null });
  await logAudit({ user, action: 'Reference Person Created', module: 'Settings', newValue: { name } });
  return id;
}

export async function updateReferencePerson(id, data, user) {
  const before = await referencePersons.get(id);
  await referencePersons.update(id, data);
  await logAudit({ user, action: 'Reference Person Updated', module: 'Settings', oldValue: before, newValue: data });
}

export async function deleteReferencePerson(id, user) {
  const before = await referencePersons.get(id);
  await referencePersons.remove(id);
  await logAudit({ user, action: 'Reference Person Deleted', module: 'Settings', oldValue: before });
}
