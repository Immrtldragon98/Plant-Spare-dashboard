import test from 'node:test';
import assert from 'node:assert/strict';
import {executeTool} from './toolRegistry.js';

test('three phase motor current uses deterministic formula',async()=>{
  const r=await executeTool('calculate_three_phase_motor_current',{power_kw:15,voltage_v:415,power_factor:0.85,efficiency:0.9},{});
  assert.ok(r.line_current_a>27&&r.line_current_a<28);
});

test('synchronous speed for 50Hz 4-pole motor is 1500 rpm',async()=>{
  const r=await executeTool('calculate_synchronous_speed',{frequency_hz:50,poles:4},{});
  assert.equal(r.synchronous_speed_rpm,1500);
});

test('shaft surface speed calculation is stable',async()=>{
  const r=await executeTool('calculate_shaft_surface_speed',{diameter_mm:100,rpm:600},{});
  assert.ok(Math.abs(r.surface_speed_m_s-Math.PI)<1e-9);
});

test('bearing life rejects invalid load',async()=>{
  const r=await executeTool('calculate_bearing_l10_life',{dynamic_capacity_kn:30,equivalent_load_kn:0,rpm:1000,bearing_type:'ball'},{});
  assert.equal(r.error,'Invalid bearing inputs');
});
