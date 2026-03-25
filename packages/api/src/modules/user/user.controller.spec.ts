import { UserController } from './user.controller';

const ORG_ID = 'org-uuid-1';
const USER_ID = 'user-uuid-1';

function createMockUserService() {
  return {
    findAll: vi.fn().mockResolvedValue([{ id: USER_ID, name: 'Alice' }]),
    findById: vi.fn().mockResolvedValue({ id: USER_ID, name: 'Alice' }),
    update: vi.fn().mockResolvedValue({ id: USER_ID, name: 'Alice Updated' }),
    delete: vi.fn().mockResolvedValue({ id: USER_ID }),
  };
}

describe('UserController', () => {
  let controller: UserController;
  let service: ReturnType<typeof createMockUserService>;

  beforeEach(() => {
    service = createMockUserService();
    controller = new UserController(service as any);
  });

  it('findAll passes orgId to service', async () => {
    const req = { user: { orgId: ORG_ID, userId: USER_ID, role: 'ADMIN' } };
    const result = await controller.findAll(req);
    expect(service.findAll).toHaveBeenCalledWith(ORG_ID);
    expect(result).toHaveLength(1);
  });

  it('findById passes id to service', async () => {
    const result = await controller.findById(USER_ID);
    expect(service.findById).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual(expect.objectContaining({ id: USER_ID }));
  });

  it('update passes id and dto to service', async () => {
    const dto = { name: 'Alice Updated' };
    const req = { user: { userId: USER_ID, role: 'ADMIN' } };
    const result = await controller.update(USER_ID, dto, req);
    expect(service.update).toHaveBeenCalledWith(USER_ID, dto);
    expect(result).toEqual(expect.objectContaining({ name: 'Alice Updated' }));
  });

  it('delete passes id to service', async () => {
    const req = { user: { userId: USER_ID, role: 'ADMIN' } };
    const result = await controller.delete(USER_ID, req);
    expect(service.delete).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual(expect.objectContaining({ id: USER_ID }));
  });
});
