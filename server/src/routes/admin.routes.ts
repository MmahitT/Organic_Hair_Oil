import { Router } from 'express';
import * as c from '../controllers/admin.controller.js';
import { ah } from '../middleware/asyncHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as cat from '../controllers/catalog.controller.js';
import { createStaffSchema, objectIdParam, updateStaffSchema } from '../validators/auth.validators.js';
import * as dash from '../controllers/dashboard.controller.js';
import * as cust from '../controllers/customers.controller.js';
import * as msg from '../controllers/contact.controller.js';
import * as setg from '../controllers/settings.admin.controller.js';
import * as rev from '../controllers/reviews.controller.js';
import * as pay from '../controllers/payments.controller.js';
import * as ord from '../controllers/orders.admin.controller.js';
import { adminOrdersQuery, adminPaymentsQuery, couponBody, couponUpdate, paymentSettingsBody, refundBody, resolvePaymentBody } from '../validators/checkout.validators.js';
import { auditQuery, businessSection, contentSection, customerParam, customerPatch, customersQuery, deliverySection, legalSection, messagePatch, messagesQuery, sectionParam, seoSection } from '../validators/admin.validators.js';
import { adminReviewsQuery, dashboardQuery, cancelBody, exportQuery, orderPatchBody, orderSettingsBody, requestDecisionBody, requestParams, returnBody, reviewPatchBody, statusBody } from '../validators/order.validators.js';
import { adjustStockSchema, adminListQuery, createProductSchema, idParam, inventoryParams, movementsQuery, taxonomyCreate, taxonomyUpdate, updateProductSchema } from '../validators/catalog.validators.js';

/**
 * Everything under /admin requires an authenticated principal of kind "admin" (deny by default).
 * Staff management and the audit log are further restricted to the superadmin role.
 * Later phases add product/order/etc. routes with finer-grained role checks.
 */
export function adminRouter() {
  const r = Router();
  r.use(ah(authenticate), authorize('admin'));

  const superOnly = authorize('admin', 'superadmin');
  r.get('/staff', superOnly, ah(c.listStaff));
  r.post('/staff', superOnly, validate({ body: createStaffSchema }), ah(c.createStaff));
  r.patch('/staff/:id', superOnly, validate({ params: objectIdParam, body: updateStaffSchema }), ah(c.updateStaff));
  r.get('/audit-logs', superOnly, validate({ query: auditQuery }), ah(c.listAuditLogs));

  // Catalogue management: admin + superadmin. Inventory: staff too (spec §11).
  const ADMIN_ROLES = ['superadmin', 'admin'] as const;
  const manage = authorize('admin', ...ADMIN_ROLES);
  const inventory = authorize('admin', ...ADMIN_ROLES, 'staff');
  // Business overview: owner/admin only (staff work from Orders and Inventory).
  r.get('/dashboard/summary', manage, validate({ query: dashboardQuery }), ah(dash.summary));
  r.get('/dashboard/sales-chart', manage, validate({ query: dashboardQuery }), ah(dash.salesChart));
  r.get('/dashboard/best-sellers', manage, validate({ query: dashboardQuery }), ah(dash.bestSellers));
  r.get('/dashboard/recent-orders', manage, ah(dash.recentOrders));
  r.get('/dashboard/low-stock', manage, ah(dash.lowStock));

  // Customers (contain phone numbers and addresses): owner/admin only.
  r.get('/customers', manage, validate({ query: customersQuery }), ah(cust.list));
  r.get('/customers/export', manage, ah(cust.exportCsv));
  r.get('/customers/:phone', manage, validate({ params: customerParam }), ah(cust.detail));
  r.patch('/customers/:phone', manage, validate({ params: customerParam, body: customerPatch }), ah(cust.patch));
  r.get('/messages', manage, validate({ query: messagesQuery }), ah(msg.list));
  r.patch('/messages/:id', manage, validate({ params: idParam, body: messagePatch }), ah(msg.setStatus));

  // Website content & business settings (payments keep their own endpoint above).
  r.get('/settings', manage, ah(setg.getSettings));
  r.put('/settings/:section', manage, validate({ params: sectionParam }), (req, res, next) => {
    const schema = { business: businessSection, delivery: deliverySection, content: contentSection, seo: seoSection, legal: legalSection }[req.params['section'] as 'business' | 'delivery' | 'content' | 'seo' | 'legal'];
    return validate({ body: schema })(req, res, next);
  }, ah(setg.putSection));

  r.get('/products', manage, validate({ query: adminListQuery }), ah(cat.adminListProducts));
  r.post('/products', manage, validate({ body: createProductSchema }), ah(cat.createProduct));
  r.get('/products/:id', manage, validate({ params: idParam }), ah(cat.adminGetProduct));
  r.patch('/products/:id', manage, validate({ params: idParam, body: updateProductSchema }), ah(cat.updateProduct));
  r.delete('/products/:id', manage, validate({ params: idParam }), ah(cat.archiveProduct));

  r.get('/inventory/export', manage, ah(cat.exportInventory));
  r.get('/inventory', inventory, ah(cat.listInventory));
  r.get('/inventory/movements', inventory, validate({ query: movementsQuery }), ah(cat.listMovements));
  r.patch('/inventory/:productId/:sku', inventory, validate({ params: inventoryParams, body: adjustStockSchema }), ah(cat.adjustInventory));

  r.post('/uploads/sign', manage, ah(cat.signImageUpload));

  // Orders are read-only until Phase 7. Staff may view orders (they will fulfil them).
  const orders = authorize('admin', ...ADMIN_ROLES, 'staff');
  r.get('/orders/summary', orders, ah(ord.summary));
  r.get('/orders/export', manage, validate({ query: exportQuery }), ah(ord.exportOrders));
  r.get('/orders', orders, validate({ query: adminOrdersQuery }), ah(ord.listOrders));
  r.get('/orders/:id', orders, validate({ params: idParam }), ah(ord.getOrder));
  r.patch('/orders/:id/status', orders, validate({ params: idParam, body: statusBody }), ah(ord.setStatus));
  r.patch('/orders/:id', orders, validate({ params: idParam, body: orderPatchBody }), ah(ord.patchOrder));
  r.post('/orders/:id/cancel', manage, validate({ params: idParam, body: cancelBody }), ah(ord.cancel));
  r.post('/orders/:id/return', manage, validate({ params: idParam, body: returnBody }), ah(ord.returnOrder));
  r.post('/orders/:id/requests/:kind', manage, validate({ params: requestParams, body: requestDecisionBody }), ah(ord.decideRequest));
  r.get('/orders/:id/invoice', orders, validate({ params: idParam }), ah(ord.adminInvoice));
  r.get('/settings/orders', manage, ah(ord.getOrderSettings));
  r.patch('/settings/orders', manage, validate({ body: orderSettingsBody }), ah(ord.updateOrderSettings));

  r.get('/reviews', orders, validate({ query: adminReviewsQuery }), ah(rev.adminList));
  r.patch('/reviews/:id', orders, validate({ params: idParam, body: reviewPatchBody }), ah(rev.adminPatch));
  r.delete('/reviews/:id', manage, validate({ params: idParam }), ah(rev.adminDelete));

  r.get('/payments/export', manage, validate({ query: adminPaymentsQuery }), ah(pay.exportPayments));
  r.get('/payments', manage, validate({ query: adminPaymentsQuery }), ah(pay.listPayments));
  r.get('/payments/:id', manage, validate({ params: idParam }), ah(pay.getPayment));
  r.post('/payments/:id/resolve', manage, validate({ params: idParam, body: resolvePaymentBody }), ah(pay.resolve));
  r.post('/payments/:id/refund', manage, validate({ params: idParam, body: refundBody }), ah(pay.refund));
  r.get('/settings/payments', manage, ah(pay.getPaymentSettings));
  r.patch('/settings/payments', manage, validate({ body: paymentSettingsBody }), ah(pay.updatePaymentSettings));

  r.get('/coupons', manage, ah(ord.listCoupons));
  r.post('/coupons', manage, validate({ body: couponBody }), ah(ord.createCoupon));
  r.patch('/coupons/:id', manage, validate({ params: idParam, body: couponUpdate }), ah(ord.updateCoupon));
  r.delete('/coupons/:id', manage, validate({ params: idParam }), ah(ord.deactivateCoupon));
  r.get('/coupons/:id/usage', manage, validate({ params: idParam }), ah(ord.couponUsage));

  for (const [path, ctl] of [['categories', cat.categoriesAdmin], ['ingredients', cat.ingredientsAdmin]] as const) {
    r.get(`/${path}`, manage, ah(ctl.list));
    r.post(`/${path}`, manage, validate({ body: taxonomyCreate }), ah(ctl.create));
    r.patch(`/${path}/:id`, manage, validate({ params: idParam, body: taxonomyUpdate }), ah(ctl.update));
    r.delete(`/${path}/:id`, manage, validate({ params: idParam }), ah(ctl.deactivate));
  }
  return r;
}
