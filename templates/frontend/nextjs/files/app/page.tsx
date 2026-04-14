export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Welcome to {{project-name}}</h1>
      <p className="text-lg text-gray-600">
        Built with Next.js and React
      </p>
    </main>
  );
}
