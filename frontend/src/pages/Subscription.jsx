import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function Subscription() {
  const { refreshProfile } = useAuth();

  const [plans, setPlans] = useState([]);
  const [mySub, setMySub] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      const [plansData, subData, txData] = await Promise.all([
        api.get('/payments/plans'),
        api.get('/payments/my-subscription'),
        api.get('/payments/my-transactions'),
      ]);

      setPlans(plansData);
      setMySub(subData);
      setTransactions(txData);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('success') === 'true') {
      loadData();
      refreshProfile();
      window.history.replaceState({}, '', '/subscription');
    }

    if (params.get('canceled') === 'true') {
      setError('Payment was cancelled. No charges were made.');
      window.history.replaceState({}, '', '/subscription');
    }
  }, []);

  const subscribe = async (planId) => {
    setError('');
    setLoading(true);

    try {
      const result = await api.post('/payments/create-subscription', {
        planId,
      });

      window.location.href = result.approvalUrl;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const cancelSubscription = async () => {
    if (
      !window.confirm(
        'Are you sure you want to cancel your subscription?'
      )
    ) {
      return;
    }

    setError('');

    try {
      await api.post('/payments/cancel-subscription');
      await loadData();
      await refreshProfile();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper mb-2">
        Subscription
      </h1>

      <p className="text-paper/50 text-sm mb-6">
        Choose a plan to receive monthly time credits via PayPal.
      </p>

      {error && (
        <p className="text-rust text-sm mb-4">
          {error}
        </p>
      )}

      {mySub && mySub.status === 'ACTIVE' && (
        <div className="card p-6 mb-8 border border-sage/30">
          <p className="label-eyebrow mb-1">
            Your active subscription
          </p>

          <p className="font-display text-2xl text-sage">
            {mySub.plan.name}
          </p>

          <p className="text-paper/50 text-sm mt-1">
            {mySub.plan.credits} credits per period &middot; $
            {(mySub.plan.priceCents / 100).toFixed(2)}
          </p>

          <div className="flex items-center gap-4 mt-4 text-xs">
            <span className="bg-sage/15 text-sage px-2 py-1 rounded font-mono">
              {mySub.status}
            </span>

            <span className="text-paper/50">
              Started{' '}
              {new Date(
                mySub.currentPeriodStart
              ).toLocaleDateString()}
            </span>
          </div>

          <button
            onClick={cancelSubscription}
            className="btn-secondary text-xs mt-4"
          >
            Cancel subscription
          </button>
        </div>
      )}

      {(!mySub || mySub.status !== 'ACTIVE') &&
        plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="card p-6 flex flex-col"
              >
                <p className="label-eyebrow mb-1">
                  {plan.name}
                </p>

                <p className="font-display text-4xl text-brass-dark mb-1">
                  ${(plan.priceCents / 100).toFixed(2)}

                  <span className="text-sm text-paper/50 font-sans">
                    /{plan.intervalMonths === 12 ? 'year' : 'month'}
                  </span>
                </p>

                <p className="text-paper/60 text-sm mb-4">
                  {plan.description}
                </p>

                <div className="flex-grow" />

                <button
                  onClick={() => subscribe(plan.id)}
                  disabled={loading}
                  className="btn-primary w-full text-sm"
                >
                  {loading
                    ? 'Processing...'
                    : 'Subscribe with PayPal'}
                </button>
              </div>
            ))}
          </div>
        )}

      {(!mySub || mySub.status !== 'ACTIVE') &&
        plans.length === 0 &&
        !error && (
          <p className="text-paper/50 text-sm">
            Loading subscription plans...
          </p>
        )}

      {transactions.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-xl text-paper mb-3">
            Payment history
          </h2>

          <div className="card divide-y divide-ink-700/10">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3 flex items-center justify-between text-sm"
              >
                <div className="flex-1">
                  <p className="text-paper font-medium">
                    {tx.type.replace(/_/g, ' ')}
                  </p>

                  <p className="text-paper/50 text-xs">
                    {tx.plan && `${tx.plan.name} `}
                    &middot;{' '}
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-mono text-sage">
                    +{tx.creditsAmount} credits
                  </p>

                  <p className="text-paper/50 text-xs">
                    ${(tx.amountCents / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}