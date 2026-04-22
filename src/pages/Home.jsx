import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import {
  Search,
  Shield,
  Bell,
  MessageSquare,
  CheckCircle,
  Zap,
  Users,
  Eye,
  MapPin,
  Clock,
  Heart,
  Download,
} from "lucide-react";

function Home() {
  const navigate = useNavigate();
  const [connectedMsg, setConnectedMsg] = useState(false);
  const [disconnectedMsg, setDisconnectedMsg] = useState(false);
  const { isInstallable, installPWA } = usePWAInstall();

  useEffect(() => {
    console.log(navigator.getGamepads());
    window.addEventListener("gamepadconnected", (e) => {
      console.log("connected");
      setConnectedMsg(true);
      setTimeout(() => {
        setConnectedMsg(false);
      }, 4000);
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      console.log("disconnected");
      setDisconnectedMsg(true);
      setTimeout(() => {
        setDisconnectedMsg(false);
      }, 4000);
    });
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50 via-white to-amber-50">
      {/* Controller Notifications */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 p-3 text-sm bg-green-300 rounded-full shadow-lg transition-all duration-500 ease-in-out ${connectedMsg ? "top-3" : "-top-20"}`}
      >
        controller input detected
      </div>
      <div
        className={`fixed left-1/2 -translate-x-1/2 p-3 text-sm bg-red-300 rounded-full shadow-lg transition-all duration-500 ease-in-out ${disconnectedMsg ? "top-3" : "-top-20"}`}
      >
        controller disconnected
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-bg-raised/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Search className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">Lost Link</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm text-slate-600 hover:text-blue-600 transition"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-slate-600 hover:text-blue-600 transition"
            >
              How it works
            </a>
            <a
              href="#benefits"
              className="text-sm text-slate-600 hover:text-blue-600 transition"
            >
              Safety
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isInstallable && (
              <Button
                variant="ghost"
                size="md"
                onClick={installPWA}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 transition-colors"
              >
                <Download className="w-6 h-6 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline ml-2">Install App</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/login")}
              className="text-slate-700"
            >
              Login
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/signup")}
              className="bg-blue-500 hover:bg-blue-600"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-20 md:py-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold text-slate-900 leading-tight">
                Find What's{" "}
                <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-blue-600">
                  Lost.
                </span>{" "}
                <br /> <span className="text-amber-500">Reunite</span> What
                Matters.
              </h1>
              <p className="text-xl text-slate-600 leading-relaxed">
                Lost Link is your trusted companion for reuniting lost items
                with their owners. Smart, secure, and community-driven.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button
                size="lg"
                onClick={() => navigate("/signup")}
                className="bg-blue-500 hover:bg-blue-600 text-base font-semibold"
              >
                Start Finding Now
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/login")}
                className="border-border text-text hover:bg-bg-sunken text-base font-semibold"
              >
                Sign In
              </Button>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-600 pt-4">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-blue-400" />
                <div className="w-8 h-8 rounded-full bg-amber-400" />
                <div className="w-8 h-8 rounded-full bg-blue-500" />
              </div>
              <p>Join 1000+ students reuniting with their belongings</p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-linear-to-r from-blue-400 to-blue-600 rounded-2xl opacity-20 blur-3xl" />
            <div className="relative bg-linear-to-br from-blue-50 to-white rounded-2xl p-8 border border-blue-100 shadow-2xl">
              <div className="space-y-4">
                <div className="bg-bg-raised rounded-lg p-4 border border-border flex items-center gap-3 shadow-sm">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900">
                      Item Location
                    </p>
                    <p className="text-xs text-slate-500">Campus Library</p>
                  </div>
                </div>
                <div className="bg-bg-raised rounded-lg p-4 border border-border flex items-center gap-3 shadow-sm">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900">
                      Found Time
                    </p>
                    <p className="text-xs text-slate-500">2 hours ago</p>
                  </div>
                </div>
                <div className="bg-bg-raised rounded-lg p-4 border border-border flex items-center gap-3 shadow-sm">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900">
                      Status
                    </p>
                    <p className="text-xs text-slate-500">
                      Matched with owner!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="bg-bg-raised border-y border-border py-20 md:py-28"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              Powerful Features for Recovery
            </h2>
            <p className="text-xl text-slate-600">
              Everything you need to find or report lost items
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Search,
                title: "Smart Search",
                description:
                  "Instantly search through thousands of reported items with advanced filters and smart matching.",
              },
              {
                icon: Bell,
                title: "Instant Notifications",
                description:
                  "Get real-time alerts when items matching your report are found on campus.",
              },
              {
                icon: MessageSquare,
                title: "Direct Messaging",
                description:
                  "Communicate securely with finders or item owners to arrange pickup.",
              },
              {
                icon: Shield,
                title: "Verified & Secure",
                description:
                  "All users are verified students ensuring a safe and trusted community.",
              },
              {
                icon: Zap,
                title: "AI-Powered Match",
                description:
                  "Advanced algorithms match lost items with found items automatically.",
              },
              {
                icon: Users,
                title: "Community Driven",
                description:
                  "Help fellow students find their belongings. Be part of the Lost Link community.",
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="group p-8 rounded-xl border border-border hover:border-primary hover:shadow-lg transition-all duration-300 bg-bg-raised hover:bg-primary-soft"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-slate-600">
              Simple steps to find or report lost items
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                num: "1",
                title: "Report or Search",
                description:
                  "Report a lost item or search for found items in the database.",
              },
              {
                num: "2",
                title: "AI Matching",
                description:
                  "Our AI matches your report with similar items automatically.",
              },
              {
                num: "3",
                title: "Get Notified",
                description:
                  "Receive instant notifications when a potential match is found.",
              },
              {
                num: "4",
                title: "Reconnect",
                description:
                  "Message the finder or owner and arrange a secure pickup.",
              },
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-linear-to-br from-blue-500 to-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center text-2xl font-bold mb-4 shadow-lg">
                  {step.num}
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-slate-600">{step.description}</p>
                {idx < 3 && (
                  <div className="hidden md:block absolute top-8 -right-3 text-2xl text-blue-300">
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section
        id="benefits"
        className="bg-linear-to-r from-blue-600 to-blue-700 text-white py-20 md:py-28"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                icon: Eye,
                title: "Visibility",
                description:
                  "Get your lost items visible to the entire campus community immediately.",
              },
              {
                icon: Heart,
                title: "Recovery Rate",
                description:
                  "Over 85% of reported items are successfully reunited with owners.",
              },
              {
                icon: Zap,
                title: "Speed",
                description:
                  "Average recovery time is less than 48 hours from report.",
              },
            ].map((benefit, idx) => (
              <div key={idx} className="flex gap-4">
                <benefit.icon className="w-8 h-8 shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-lg mb-2">{benefit.title}</h3>
                  <p className="text-blue-100">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-20 md:py-28">
        <div className="bg-linear-to-br from-slate-900 to-slate-800 rounded-2xl p-12 md:p-16 text-center space-y-6">
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            Start Your Search Today
          </h2>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Join Lost Link now and become part of a community dedicated to
            reuniting students with their belongings.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button
              size="lg"
              onClick={() => navigate("/signup")}
              className="bg-blue-500 hover:bg-blue-600 text-base font-semibold"
            >
              Create Account
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/login")}
              className="border-border text-text bg-bg-raised hover:bg-bg-sunken text-base font-semibold"
            >
              Sign In Instead
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
                  <Search className="w-4 h-4 text-white" />
                </div>
                Lost Link
              </h3>
              <p className="text-sm">Finding lost items, reuniting students.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#features" className="hover:text-white transition">
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#how-it-works"
                    className="hover:text-white transition"
                  >
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#benefits" className="hover:text-white transition">
                    Safety Tips
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Privacy
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Get Started</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <button
                    onClick={() => navigate("/login")}
                    className="hover:text-white transition"
                  >
                    Login
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigate("/signup")}
                    className="hover:text-white transition"
                  >
                    Sign Up
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center text-sm">
            <p>&copy; 2024 Lost Link. All rights reserved.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-white transition">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-white transition">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Home;
