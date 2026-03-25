import type { NextPageContext } from 'next';

function Error({ statusCode }: { statusCode?: number }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#0f172a' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 700, color: '#f1f5f9' }}>{statusCode ?? 'Error'}</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
          {statusCode === 404 ? 'Page not found' : 'An error occurred'}
        </p>
      </div>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default Error;
