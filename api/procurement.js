import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

function calcOrderByDate(requiredBy, leadWeeks) {
  if (!requiredBy || !leadWeeks) return requiredBy || null
  const d = new Date(requiredBy + 'T12:00:00')
  d.setDate(d.getDate() - Math.round(leadWeeks * 7))
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const action = req.query.action || req.body?.action

  // ── GET ──
  if (req.method === 'GET') {
    if (action === 'items') {
      const projectId = req.query.projectId
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' })
      let q = supabase.from('procurement_items').select('*, procurement_quotes(id, supplier_name, quoted_price, is_selected)').eq('project_id', projectId).neq('status', 'cancelled').order('item_number')
      if (req.query.status) q = q.eq('status', req.query.status)
      if (req.query.category) q = q.eq('category', req.query.category)
      if (req.query.search) q = q.ilike('description', `%${req.query.search}%`)
      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ items: data || [] })
    }

    if (action === 'quotes') {
      const itemId = req.query.itemId
      if (!itemId) return res.status(400).json({ error: 'Missing itemId' })
      const { data } = await supabase.from('procurement_quotes').select('*').eq('procurement_item_id', itemId).order('created_at')
      return res.json({ quotes: data || [] })
    }

    if (action === 'invoices') {
      const itemId = req.query.itemId
      if (!itemId) return res.status(400).json({ error: 'Missing itemId' })
      const { data } = await supabase.from('procurement_invoices').select('*').eq('procurement_item_id', itemId).order('invoice_date')
      return res.json({ invoices: data || [] })
    }

    if (action === 'attachments') {
      const itemId = req.query.itemId
      if (!itemId) return res.status(400).json({ error: 'Missing itemId' })
      const { data } = await supabase.from('procurement_attachments').select('*').eq('procurement_item_id', itemId).order('uploaded_at', { ascending: false })
      return res.json({ attachments: data || [] })
    }

    if (action === 'audit') {
      const itemId = req.query.itemId
      if (!itemId) return res.status(400).json({ error: 'Missing itemId' })
      const { data } = await supabase.from('procurement_audit_log').select('*').eq('procurement_item_id', itemId).order('created_at', { ascending: false }).limit(20)
      return res.json({ entries: data || [] })
    }

    if (action === 'summary') {
      const projectId = req.query.projectId
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' })
      const { data } = await supabase.from('procurement_items').select('status, order_by_date, required_by_date, delivery_scheduled_date, delivery_received_date').eq('project_id', projectId).neq('status', 'cancelled')
      const items = data || []
      const today = new Date().toISOString().split('T')[0]
      const in7 = calcOrderByDate(today, -1) // today + 7 days
      let red = 0, amber = 0, green = 0
      const prePO = ['identified', 'specified', 'quoted', 'approved']
      for (const item of items) {
        if (item.status === 'received') { green++; continue }
        if (prePO.includes(item.status)) {
          if (!item.order_by_date) continue
          if (item.order_by_date < today) red++
          else if (item.order_by_date <= in7) amber++
          else green++
        } else {
          if (item.delivery_scheduled_date && item.delivery_scheduled_date > item.required_by_date) red++
          else if (!item.delivery_scheduled_date && item.required_by_date) amber++
          else green++
        }
      }
      return res.json({ total: items.length, red, amber, green })
    }

    if (action === 'export') {
      const projectId = req.query.projectId
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' })
      const { data } = await supabase.from('procurement_items').select('*, procurement_quotes(supplier_name, quoted_price, is_selected)').eq('project_id', projectId).order('item_number')
      const items = data || []
      const headers = ['Item #','Description','Category','Qty','Unit','Status','Required By','Lead Time (wks)','Order By','Budget','Supplier','Quoted Price','PO Number','Delivery Scheduled','Delivery Received','Condition']
      const rows = items.map(i => {
        const sel = (i.procurement_quotes || []).find(q => q.is_selected)
        return [i.item_number, i.description, i.category||'', i.quantity||'', i.unit||'', i.status, i.required_by_date||'', i.lead_time_weeks||'', i.order_by_date||'', i.budget_cost||'', sel?.supplier_name||'', sel?.quoted_price||'', i.po_number||'', i.delivery_scheduled_date||'', i.delivery_received_date||'', i.delivery_condition||'']
      })
      const csv = [headers,...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="procurement-${projectId.slice(0,8)}.csv"`)
      return res.send(csv)
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // ── POST ──
  if (req.method === 'POST') {
    if (action === 'item') {
      const b = req.body
      if (!b.projectId || !b.description) return res.status(400).json({ error: 'Missing projectId or description' })

      // Auto-generate item number
      const { data: existing } = await supabase.from('procurement_items').select('item_number').eq('project_id', b.projectId).order('item_number', { ascending: false }).limit(1)
      const lastNum = existing?.[0]?.item_number ? parseInt(existing[0].item_number.replace('PT-',''),10) : 0
      const itemNumber = `PT-${String(lastNum + 1).padStart(3, '0')}`

      // If linked to programme task, pull required_by_date
      let requiredByDate = b.required_by_date || null
      if (b.linked_programme_task_id) {
        const { data: task } = await supabase.from('programme_tasks').select('start_date').eq('id', b.linked_programme_task_id).single()
        if (task) requiredByDate = task.start_date
      }

      const orderByDate = calcOrderByDate(requiredByDate, b.lead_time_weeks)

      const { data, error } = await supabase.from('procurement_items').insert({
        project_id: b.projectId,
        item_number: itemNumber,
        description: b.description.trim(),
        category: b.category?.trim() || null,
        specification: b.specification?.trim() || null,
        quantity: b.quantity || null,
        unit: b.unit?.trim() || null,
        linked_programme_task_id: b.linked_programme_task_id || null,
        required_by_date: requiredByDate,
        lead_time_weeks: b.lead_time_weeks || 0,
        order_by_date: orderByDate,
        status: 'identified',
        budget_cost: b.budget_cost || null,
        notes: b.notes?.trim() || null,
        created_by_user_id: b.userId || null,
      }).select().single()

      if (error) return res.status(500).json({ error: error.message })

      // Audit
      await supabase.from('procurement_audit_log').insert({
        procurement_item_id: data.id,
        action: 'created',
        actor_name: b.userName || 'Unknown',
        actor_id: b.userId,
        actor_role: b.userRole || 'manager',
        details: { description: b.description },
      })

      return res.json({ success: true, item: data })
    }

    if (action === 'quote') {
      const b = req.body
      if (!b.procurement_item_id || !b.supplier_name) return res.status(400).json({ error: 'Missing item or supplier' })
      const { data, error } = await supabase.from('procurement_quotes').insert({
        procurement_item_id: b.procurement_item_id,
        supplier_name: b.supplier_name.trim(),
        supplier_contact_name: b.supplier_contact_name?.trim() || null,
        supplier_contact_email: b.supplier_contact_email?.trim() || null,
        supplier_contact_phone: b.supplier_contact_phone?.trim() || null,
        quoted_price: b.quoted_price || null,
        quoted_lead_time_weeks: b.quoted_lead_time_weeks || null,
        quote_date: b.quote_date || null,
        quote_reference: b.quote_reference?.trim() || null,
        notes: b.notes?.trim() || null,
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })

      // Auto-advance status to 'quoted' if currently identified or specified
      const { data: item } = await supabase.from('procurement_items').select('status').eq('id', b.procurement_item_id).single()
      if (item && ['identified', 'specified'].includes(item.status)) {
        await supabase.from('procurement_items').update({ status: 'quoted', updated_at: new Date().toISOString() }).eq('id', b.procurement_item_id)
      }

      return res.json({ success: true, quote: data })
    }

    if (action === 'invoice') {
      const b = req.body
      if (!b.procurement_item_id) return res.status(400).json({ error: 'Missing item' })
      const { data, error } = await supabase.from('procurement_invoices').insert({
        procurement_item_id: b.procurement_item_id,
        invoice_number: b.invoice_number?.trim() || null,
        invoice_date: b.invoice_date || null,
        invoice_amount: b.invoice_amount || 0,
        notes: b.notes?.trim() || null,
        created_by_user_id: b.userId || null,
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true, invoice: data })
    }

    if (action === 'mark-received') {
      const b = req.body
      if (!b.id) return res.status(400).json({ error: 'Missing item id' })
      const updates = {
        status: 'received',
        delivery_received_date: new Date().toISOString().split('T')[0],
        received_by_user_id: b.userId || null,
        delivery_condition: b.condition || 'good',
        delivery_notes: b.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('procurement_items').update(updates).eq('id', b.id)
      if (error) return res.status(500).json({ error: error.message })

      // Audit
      await supabase.from('procurement_audit_log').insert({
        procurement_item_id: b.id,
        action: 'received',
        actor_name: b.userName || 'Unknown',
        actor_id: b.userId,
        details: { condition: b.condition },
      })

      // Notify PMs if damaged/rejected
      if (['damaged', 'rejected'].includes(b.condition)) {
        const { data: item } = await supabase.from('procurement_items').select('project_id, description, item_number').eq('id', b.id).single()
        if (item) {
          const { data: project } = await supabase.from('projects').select('company_id').eq('id', item.project_id).single()
          if (project) {
            const { data: managers } = await supabase.from('profiles').select('id').eq('company_id', project.company_id).in('role', ['manager', 'admin', 'super_admin'])
            for (const m of (managers || [])) {
              await supabase.from('notifications').insert({
                company_id: project.company_id,
                user_id: m.id,
                type: 'warning',
                title: `Delivery ${b.condition}: ${item.item_number}`,
                body: `${item.description} — ${b.condition}. ${b.notes || ''}`.trim(),
                link: '/app/procurement',
              })
            }
          }
        }
      }

      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // ── PATCH ──
  if (req.method === 'PATCH') {
    if (action === 'item') {
      const b = req.body
      if (!b.id) return res.status(400).json({ error: 'Missing item id' })

      const { data: existing } = await supabase.from('procurement_items').select('*').eq('id', b.id).single()
      if (!existing) return res.status(404).json({ error: 'Item not found' })

      const updates = { updated_at: new Date().toISOString() }
      const fields = ['description','category','specification','quantity','unit','required_by_date','lead_time_weeks','status','budget_cost','po_number','po_raised_date','po_acknowledged_date','delivery_scheduled_date','delivery_notes','notes','linked_programme_task_id']
      for (const f of fields) {
        if (b[f] !== undefined) updates[f] = b[f] === '' ? null : b[f]
      }

      // If linked task changed, update required_by_date
      if (b.linked_programme_task_id !== undefined) {
        if (b.linked_programme_task_id) {
          const { data: task } = await supabase.from('programme_tasks').select('start_date').eq('id', b.linked_programme_task_id).single()
          if (task) updates.required_by_date = task.start_date
        }
      }

      // Recalculate order_by_date
      const rbd = updates.required_by_date || existing.required_by_date
      const ltw = updates.lead_time_weeks !== undefined ? updates.lead_time_weeks : existing.lead_time_weeks
      updates.order_by_date = calcOrderByDate(rbd, ltw)

      // Auto-advance status based on field changes
      if (b.po_number && !existing.po_number && ['identified','specified','quoted','approved'].includes(existing.status)) {
        updates.status = 'po_raised'
      }

      const { error } = await supabase.from('procurement_items').update(updates).eq('id', b.id)
      if (error) return res.status(500).json({ error: error.message })

      // Audit
      const changed = {}
      for (const f of Object.keys(updates)) {
        if (f === 'updated_at') continue
        if (String(existing[f] ?? '') !== String(updates[f] ?? '')) changed[f] = { from: existing[f], to: updates[f] }
      }
      if (Object.keys(changed).length > 0) {
        await supabase.from('procurement_audit_log').insert({
          procurement_item_id: b.id,
          action: 'updated',
          actor_name: b.userName || 'Unknown',
          actor_id: b.userId,
          actor_role: b.userRole || 'manager',
          details: changed,
        })
      }

      return res.json({ success: true })
    }

    if (action === 'quote') {
      const b = req.body
      if (!b.id) return res.status(400).json({ error: 'Missing quote id' })

      const updates = { updated_at: new Date().toISOString() }
      for (const f of ['supplier_name','supplier_contact_name','supplier_contact_email','supplier_contact_phone','quoted_price','quoted_lead_time_weeks','quote_date','quote_reference','notes']) {
        if (b[f] !== undefined) updates[f] = b[f] === '' ? null : b[f]
      }

      // Handle is_selected: unset others for the same item
      if (b.is_selected !== undefined) {
        updates.is_selected = b.is_selected
        if (b.is_selected) {
          const { data: quote } = await supabase.from('procurement_quotes').select('procurement_item_id').eq('id', b.id).single()
          if (quote) {
            await supabase.from('procurement_quotes').update({ is_selected: false }).eq('procurement_item_id', quote.procurement_item_id).neq('id', b.id)
            await supabase.from('procurement_items').update({ selected_quote_id: b.id, updated_at: new Date().toISOString() }).eq('id', quote.procurement_item_id)
          }
        }
      }

      const { error } = await supabase.from('procurement_quotes').update(updates).eq('id', b.id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    if (action === 'item') {
      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'Missing id' })
      await supabase.from('procurement_items').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id)
      return res.json({ success: true })
    }
    if (action === 'quote') {
      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'Missing id' })
      await supabase.from('procurement_quotes').delete().eq('id', id)
      return res.json({ success: true })
    }
    if (action === 'attachment') {
      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const { data: att } = await supabase.from('procurement_attachments').select('file_url').eq('id', id).single()
      if (att?.file_url) {
        const path = att.file_url.split('/storage/v1/object/public/documents/')[1]
        if (path) await supabase.storage.from('documents').remove([path])
      }
      await supabase.from('procurement_attachments').delete().eq('id', id)
      return res.json({ success: true })
    }
    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
