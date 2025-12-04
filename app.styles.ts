/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css} from 'lit';

export const appStyles = css`
  :host {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #100c14;
    color: white;
  }

  .tabs {
    display: flex;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 20;
  }

  .tabs button {
    background: transparent;
    border: none;
    color: white;
    padding: 10px 20px;
    cursor: pointer;
    font-size: 16px;
    position: relative;
    opacity: 0.7;
    transition: opacity 0.3s ease;
  }

  .tabs button:hover {
    opacity: 1;
  }

  .tabs button.active {
    opacity: 1;
  }

  .tabs button.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 10px;
    right: 10px;
    height: 2px;
    background: white;
  }

  .tab-content {
    flex-grow: 1;
    position: relative;
    width: 100%;
    height: 100%;
  }

  .audio-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    position: relative;
  }

  .context-info {
    background: rgba(255, 255, 255, 0.1);
    padding: 10px 20px;
    text-align: center;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: absolute;
    top: 80px; /* Below tabs */
    left: 50%;
    transform: translateX(-50%);
    border-radius: 8px;
    z-index: 10;
    width: auto;
    min-width: 300px;
    max-width: 90%;
  }

  .clear-context-button {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
    margin-left: 15px;
    transition: background-color 0.3s ease;
  }

  .clear-context-button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  #status {
    position: absolute;
    bottom: 5vh;
    left: 0;
    right: 0;
    z-index: 10;
    text-align: center;
  }

  .controls {
    z-index: 10;
    position: absolute;
    bottom: 10vh;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;

    button {
      outline: none;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.1);
      width: 64px;
      height: 64px;
      cursor: pointer;
      font-size: 24px;
      padding: 0;
      margin: 0;
      transition: background-color 0.3s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }
    }

    button[disabled] {
      display: none;
    }
  }

  .slideshow-container {
    position: absolute;
    inset: 0;
    cursor: pointer;
    z-index: 1; /* Behind controls */
  }

  .slideshow-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
  }

  .slideshow-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to top,
      rgba(16, 12, 20, 0.8) 0%,
      rgba(16, 12, 20, 0) 50%
    );
  }

  .slideshow-info {
    position: absolute;
    bottom: calc(10vh + 160px);
    left: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 8px;
    padding: 15px;
    pointer-events: none;
    max-height: 25%;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(5px);
  }

  .slideshow-caption {
    color: #a5b4fc;
    font-size: 16px;
    font-weight: bold;
    margin: 0 0 10px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .slideshow-context p {
    margin: 5px 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: flex-start;
  }

  .slideshow-context strong {
    font-weight: bold;
    color: rgba(255, 255, 255, 0.7);
    margin-right: 8px;
    flex-shrink: 0;
  }

  .image-view {
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    padding: 20px;
    box-sizing: border-box;
    gap: 20px;
    overflow-y: auto;
    padding-top: 100px; /* Space for tabs */
  }

  .image-container {
    width: 100%;
    max-width: 500px;
    min-height: 200px;
    border: 2px dashed rgba(255, 255, 255, 0.3);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    position: relative;
    cursor: pointer;
    transition: border-color 0.3s ease;
    overflow: hidden;
  }

  .image-container.dragging {
    border-color: #a5b4fc;
    background: rgba(165, 180, 252, 0.1);
    border-style: solid;
  }

  .image-container:hover {
    border-color: rgba(255, 255, 255, 0.6);
  }

  .image-container img {
    max-width: 100%;
    max-height: 40vh;
    border-radius: 8px;
    object-fit: contain;
  }

  .image-gallery {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px;
    justify-content: center;
    max-height: 40vh;
    overflow-y: auto;
  }

  .gallery-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 5px;
  }

  .gallery-item img {
    width: 100px;
    height: 100px;
    object-fit: cover;
    border-radius: 4px;
  }

  .gallery-item p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
  }

  #image-upload {
    display: none;
  }

  .form-container {
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .context-display {
    width: 100%;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 15px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-sizing: border-box;
  }

  .context-display h4 {
    margin-top: 0;
    margin-bottom: 10px;
  }

  .context-item {
    margin-bottom: 12px;
    font-size: 14px;
    padding-left: 10px;
    border-left: 2px solid rgba(165, 180, 252, 0.5);
  }

  .context-item strong {
    color: #a5b4fc;
    display: block;
    margin-bottom: 5px;
  }

  .context-item p {
    margin: 3px 0;
    color: rgba(255, 255, 255, 0.9);
  }

  .context-item p.ai-context {
    color: rgba(255, 255, 255, 0.75);
    display: flex;
    align-items: flex-start;
  }

  .context-item p em {
    font-style: normal;
    font-weight: bold;
    color: rgba(255, 255, 255, 0.6);
    margin-right: 5px;
  }

  textarea {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    border-radius: 8px;
    padding: 10px;
    font-family: inherit;
    font-size: 16px;
    resize: vertical;
    min-height: 80px;
  }

  .submit-button {
    outline: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
    width: 100%;
    height: 48px;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.3s ease;
  }

  .submit-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  .submit-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .response-container {
    width: 100%;
    max-width: 500px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 15px;
    white-space: pre-wrap;
    word-wrap: break-word;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .error {
    color: #ff6b6b;
  }

  .loader {
    width: 20px;
    height: 20px;
    border: 2px solid #fff;
    border-bottom-color: transparent;
    border-radius: 50%;
    display: inline-block;
    box-sizing: border-box;
    animation: rotation 1s linear infinite;
  }

  .loader-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.5);
    border-bottom-color: transparent;
    border-radius: 50%;
    display: inline-block;
    box-sizing: border-box;
    animation: rotation 1s linear infinite;
    flex-shrink: 0;
    margin-left: 8px;
    margin-top: 2px;
  }

  @keyframes rotation {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;
