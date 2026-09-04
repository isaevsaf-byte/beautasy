import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/clerkServer";
import { clerkEnabled } from "@/lib/clerk";
import Link from "next/link";
import { Package, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { sanityClient } from "@/lib/sanity";

export const dynamic = "force-dynamic";

interface OrderItem {
  name: string;
  quantity: number;
  amountTotal: number;
}

interface Order {
  _id: string;
  stripeSessionId: string;
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
}

const ORDERS_QUERY = `*[_type == "order" && userId == $userId] | order(createdAt desc) {
  _id, stripeSessionId, items, total, status, createdAt
}`;

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  "in-production": "In Production",
  shipped: "Shipped",
  delivered: "Delivered",
};

export default async function OrdersPage() {
  // No accounts without Clerk, so there is no order history page either
  if (!clerkEnabled) notFound();

  const userId = await currentUserId();

  if (!userId) {
    redirect("/sign-in?redirect_url=/orders");
  }

  const orders: Order[] = await sanityClient.fetch(ORDERS_QUERY, { userId });

  return (
    <>
      <Header />
      <main className="pt-28 min-h-[60vh]">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <h1 className="font-serif text-3xl sm:text-4xl mb-8">My Orders</h1>

          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 bg-lavender-bg/40 rounded-2xl border border-lavender-soft/30">
              <Package size={40} className="text-lavender-soft mb-4" />
              <p className="font-serif text-lg mb-2">No orders yet</p>
              <p className="text-sm text-charcoal-light mb-6">
                When you place an order, it will show up here.
              </p>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
              >
                Shop Collection
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order._id}
                  className="bg-white/70 border border-lavender-soft/30 rounded-2xl p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-charcoal-light">
                        {new Date(order.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p className="font-serif text-lg">£{(order.total / 100).toFixed(2)}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-lavender/20 text-charcoal">
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {order.items.map((item, i) => (
                      <li key={i} className="text-sm text-charcoal-light flex justify-between">
                        <span>{item.name} × {item.quantity}</span>
                        <span>£{(item.amountTotal / 100).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
