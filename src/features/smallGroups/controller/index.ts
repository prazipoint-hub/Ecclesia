import { guarded } from '@/features/shared';
import { smallGroupService as service } from '../service';
import * as T from '../types';

export class SmallGroupController {
  list = guarded(async (req, res) => { res.json(await service.list(req.user!, T.GroupListQuerySchema.parse(req.query))); });
  get = guarded(async (req, res) => { res.json(await service.get(req.user!, req.params.id)); });
  create = guarded(async (req, res) => { res.status(201).json(await service.create(req.user!, T.CreateGroupSchema.parse(req.body))); });
  update = guarded(async (req, res) => { res.json(await service.update(req.user!, req.params.id, T.UpdateGroupSchema.parse(req.body))); });
  addMember = guarded(async (req, res) => { res.status(201).json(await service.addMember(req.user!, req.params.id, T.AddMemberSchema.parse(req.body))); });
  setMemberRole = guarded(async (req, res) => { res.json(await service.setMemberRole(req.user!, req.params.id, req.params.membershipId, T.SetMemberRoleSchema.parse(req.body).role)); });
  removeMember = guarded(async (req, res) => { res.json(await service.removeMember(req.user!, req.params.id, req.params.membershipId)); });
  recordSession = guarded(async (req, res) => { res.status(201).json(await service.recordSession(req.user!, req.params.id, T.CreateSessionSchema.parse(req.body))); });
  listSessions = guarded(async (req, res) => { res.json(await service.listSessions(req.user!, req.params.id, T.SessionListQuerySchema.parse(req.query))); });
  getSession = guarded(async (req, res) => { res.json(await service.getSession(req.user!, req.params.id, req.params.sessionId)); });
  setAttendance = guarded(async (req, res) => { res.json(await service.setAttendance(req.user!, req.params.id, req.params.sessionId, T.SetAttendanceSchema.parse(req.body).attendance)); });
  summary = guarded(async (req, res) => { res.json(await service.attendanceSummary(req.user!, req.params.id)); });
}

export const smallGroupController = new SmallGroupController();
