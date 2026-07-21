import { crudFor, orderBy } from './firestoreCrud';
import { COLLECTIONS } from '../constants/collections';
import { SEED_HOTEL_DEPARTMENTS } from '../constants/categories';
import { logAudit } from './auditService';

const departments = crudFor(COLLECTIONS.DEPARTMENTS);

export async function listDepartments() {
  const list = await departments.list([orderBy('name')]);
  if (list.length === 0) {
    await Promise.all(SEED_HOTEL_DEPARTMENTS.map((name) => departments.create({ name })));
    return departments.list([orderBy('name')]);
  }
  return list;
}

export function subscribeDepartments(callback) {
  return departments.subscribe([orderBy('name')], callback);
}

export async function createDepartment(name, user) {
  const id = await departments.create({ name });
  await logAudit({ user, action: 'Department Created', module: 'Settings', newValue: { name } });
  return id;
}

export async function deleteDepartment(id, user) {
  await departments.remove(id);
  await logAudit({ user, action: 'Department Deleted', module: 'Settings', oldValue: { id } });
}
