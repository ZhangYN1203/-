// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrderEdit from '../src/pages/OrderEdit'
let saved: any
const item = (id: number) => ({ id, orderId: 1, productCode: 'p'+id, productName: '产品'+id, specification:'200g', packageSpec:'1x20', unit:'箱', quantity:1,price:2,amount:2,remark:'' })
beforeEach(() => {
  saved = { id:1, documentNo:'DB-20261116-001',orderNo:'',date:'2026-11-16',receiver:'测试客户',sender:'测试发货方',items:[item(1),item(2)] }
  Object.defineProperty(window, 'electronAPI', { configurable:true, value: {
    getOrderById:async()=>structuredClone(saved),searchCustomers:async()=>[],
    deleteOrderItem:async(id:number)=>{saved.items=saved.items.filter((r:any)=>r.id!==id)},
    saveOrderWithItems:async(data:any)=>{saved={...saved,...data.order,items:data.items};return{id:1,documentNo:saved.documentNo}},
    getOrderItems:async()=>saved.items,updateOrder:async()=>{},
    createOrderItem:async(data:any)=>{saved.items.push(data);return{id:3}},
  } })
})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
function open() { render(<MemoryRouter initialEntries={['/orders/1']} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes><Route path="/orders/:id" element={<OrderEdit/>}/><Route path="/" element={<div>订单列表测试页</div>}/></Routes></MemoryRouter>) }
it('removing an existing row changes only the draft until save', async()=>{
  open();await screen.findByDisplayValue('p1 - 产品1')
  fireEvent.click(screen.getAllByRole('button',{name:'删除'})[0])
  await waitFor(()=>expect(screen.queryByDisplayValue('p1 - 产品1')).toBeNull())
  expect(saved.items).toHaveLength(2)
})
it('canceling the leave confirmation keeps the unsaved draft on screen',async()=>{
  open();await screen.findByDisplayValue('p1 - 产品1')
  fireEvent.click(screen.getAllByRole('button',{name:'删除'})[0])
  vi.spyOn(window,'confirm').mockReturnValue(false)
  fireEvent.click(screen.getAllByRole('button',{name:'返回列表'})[0])
  expect(screen.queryByText('订单列表测试页')).toBeNull()
  expect(screen.queryByDisplayValue('p2 - 产品2')).not.toBeNull()
})
it('saving commits the remaining draft as a whole and returns to the list',async()=>{
  open();await screen.findByDisplayValue('p1 - 产品1')
  fireEvent.click(screen.getAllByRole('button',{name:'删除'})[0])
  fireEvent.click(screen.getAllByRole('button',{name:'保存订单'})[0])
  await screen.findByText('订单列表测试页')
  expect(saved.items.map((r:any)=>r.productCode)).toEqual(['p2'])
  expect(saved.items[0].packageSpec).toBe('1x20')
})
