import { BadRequestException, Logger, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Model } from 'mongoose';
import { ErrorEnvelopeFilter } from '../common/error-envelope.filter.js';
import { PreferenceController } from './preference.controller.js';
import { ACTIVE_PREFERENCE_ID, type PreferenceDoc } from './preference.schema.js';
import { PreferenceService } from './preference.service.js';

/** An in-memory stand-in for the `preference` collection. */
function fakeModel() {
  const docs = new Map<string, PreferenceDoc>();
  const updateOne = vi.fn((filter: { _id: string }, update: { $set: Omit<PreferenceDoc, '_id'> }, options: unknown) => ({
    exec: async () => {
      void options;
      docs.set(filter._id, { _id: filter._id, ...docs.get(filter._id), ...update.$set });
      return { acknowledged: true };
    },
  }));
  const findById = vi.fn((id: string) => {
    const chain = { lean: () => chain, exec: async () => (docs.has(id) ? structuredClone(docs.get(id)!) : null) };
    return chain;
  });
  return { model: { findById, updateOne } as unknown as Model<PreferenceDoc>, docs, updateOne };
}

function setup() {
  const fake = fakeModel();
  const controller = new PreferenceController(new PreferenceService(fake.model));
  return { ...fake, controller };
}

async function rejection(promise: () => Promise<unknown>): Promise<unknown> {
  try {
    await promise();
  } catch (err) {
    return err;
  }
  throw new Error('expected a rejection');
}

describe('preference endpoints', () => {
  it('returns the defaults on a fresh database', async () => {
    expect(await setup().controller.get()).toEqual({ roleKeywords: [], minMatch: 40 });
  });

  it('saves and reloads the same values under the one fixed id', async () => {
    const { controller, updateOne, docs } = setup();

    const saved = await controller.put({ roleKeywords: ['Frontend'], minMatch: 55 });

    expect(saved).toEqual({ roleKeywords: ['Frontend'], minMatch: 55 });
    expect(await controller.get()).toEqual({ roleKeywords: ['Frontend'], minMatch: 55 });
    expect(updateOne).toHaveBeenCalledWith({ _id: ACTIVE_PREFERENCE_ID }, expect.anything(), { upsert: true });
    await controller.put({ roleKeywords: [], minMatch: 40 });
    expect([...docs.keys()]).toEqual([ACTIVE_PREFERENCE_ID]);
  });

  it('trims keywords and drops case-insensitive duplicates', async () => {
    const { controller } = setup();
    expect(await controller.put({ roleKeywords: [' React ', 'react', 'Frontend', 'FRONTEND'], minMatch: 40 })).toEqual({
      roleKeywords: ['React', 'Frontend'],
      minMatch: 40,
    });
  });

  it.each([
    ['minMatch above 100', { roleKeywords: [], minMatch: 150 }],
    ['a fractional minMatch', { roleKeywords: [], minMatch: 40.5 }],
    ['an empty keyword', { roleKeywords: [''], minMatch: 40 }],
    ['a blank keyword', { roleKeywords: ['   '], minMatch: 40 }],
    ['a keyword with no letter or digit', { roleKeywords: ['++'], minMatch: 40 }],
    ['a 41-char keyword', { roleKeywords: ['x'.repeat(41)], minMatch: 40 }],
    ['21 keywords', { roleKeywords: Array.from({ length: 21 }, (_, i) => `k${i}`), minMatch: 40 }],
    ['a missing body', undefined],
  ])('rejects %s with 400 and saves nothing', async (_label, body) => {
    const { controller, updateOne } = setup();
    await controller.put({ roleKeywords: ['Frontend'], minMatch: 55 });
    updateOne.mockClear();

    const err = await rejection(() => controller.put(body));

    expect(err).toBeInstanceOf(BadRequestException);
    expect(updateOne).not.toHaveBeenCalled();
    expect(await controller.get()).toEqual({ roleKeywords: ['Frontend'], minMatch: 55 });

    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
    new ErrorEnvelopeFilter().catch(err, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: { code: 'bad_request', message: expect.stringContaining('Invalid preference') } });
  });

  it('warns and returns the defaults when the stored document is invalid', async () => {
    const { controller, docs } = setup();
    docs.set(ACTIVE_PREFERENCE_ID, { _id: ACTIVE_PREFERENCE_ID, roleKeywords: [], minMatch: 150 });
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(await controller.get()).toEqual({ roleKeywords: [], minMatch: 40 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('minMatch'));
    warn.mockRestore();
  });

  it('returns the saved value without re-reading', async () => {
    const { controller, model } = setup();
    const findById = (model as unknown as { findById: ReturnType<typeof vi.fn> }).findById;
    findById.mockImplementation(() => {
      throw new Error('read failed');
    });
    expect(await controller.put({ roleKeywords: ['Frontend'], minMatch: 55 })).toEqual({ roleKeywords: ['Frontend'], minMatch: 55 });
  });

  it('accepts a 40-char keyword and 20 keywords', async () => {
    const { controller } = setup();
    const twenty = Array.from({ length: 20 }, (_, i) => `k${i}`);
    expect((await controller.put({ roleKeywords: ['x'.repeat(40)], minMatch: 0 })).roleKeywords).toEqual(['x'.repeat(40)]);
    expect((await controller.put({ roleKeywords: twenty, minMatch: 100 })).roleKeywords).toEqual(twenty);
  });
});
